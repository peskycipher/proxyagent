/**
 * Database layer with two drivers behind one async interface:
 * - Workers/Cloudflare: D1 binding (`DB`) via getCloudflareContext
 * - Local dev & tests: better-sqlite3 file DB (same schema, auto-init)
 *
 * All statements are plain SQL; params are positional (?).
 */

export interface DbStmt {
  sql: string;
  params?: unknown[];
}

export interface DbRunResult {
  changes: number;
}

export interface Db {
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;
  run(sql: string, ...params: unknown[]): Promise<DbRunResult>;
  /** Atomic: statements run sequentially; the whole batch rolls back on error. */
  batch(stmts: DbStmt[]): Promise<DbRunResult[]>;
}

// ---------------------------------------------------------------------------
// Local driver (better-sqlite3, loaded lazily so it is never imported in a
// Worker runtime where native addons cannot load)
// ---------------------------------------------------------------------------

type SqliteDb = import("better-sqlite3").Database;

function localDriver(db: SqliteDb): Db {
  return {
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      return db.prepare(sql).get(...params) as T | undefined;
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      return db.prepare(sql).all(...params) as T[];
    },
    async run(sql: string, ...params: unknown[]): Promise<DbRunResult> {
      const res = db.prepare(sql).run(...params);
      return { changes: res.changes };
    },
    async batch(stmts: DbStmt[]): Promise<DbRunResult[]> {
      const txn = db.transaction((list: DbStmt[]) => list.map((s) => db.prepare(s.sql).run(...(s.params ?? []))));
      return txn(stmts).map((r) => ({ changes: r.changes }));
    },
  };
}

type BetterSqlite3Ctor = new (file: string, options?: unknown) => SqliteDb;

function openLocalDb(): SqliteDb {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3") as BetterSqlite3Ctor;
  const path = require("node:path") as typeof import("node:path");
  const fs = require("node:fs") as typeof import("node:fs");
  const file = process.env.APP_DB_PATH || process.env.DB_PATH || path.join(process.cwd(), "data", "app.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  for (const sql of MIGRATIONS) {
    try {
      db.exec(sql);
    } catch {
      // duplicate column / already applied
    }
  }
  return db;
}

// ---------------------------------------------------------------------------
// D1 driver
// ---------------------------------------------------------------------------

interface D1Response<T = unknown> {
  results?: T[];
  meta: { changes: number };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  run<T = unknown>(): Promise<D1Response<T>>;
  all<T = unknown>(): Promise<D1Response<T>>;
}

interface D1Like {
  prepare(sql: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Response<T>[]>;
}

function d1Driver(d1: D1Like): Db {
  const toStmt = (s: DbStmt) => d1.prepare(s.sql).bind(...(s.params ?? []));
  return {
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      return ((await d1.prepare(sql).bind(...params).first<T>()) as T | null) ?? undefined;
    },
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      const res = await d1.prepare(sql).bind(...params).all<T>();
      return res.results ?? [];
    },
    async run(sql: string, ...params: unknown[]): Promise<DbRunResult> {
      const res = await d1.prepare(sql).bind(...params).run();
      return { changes: res.meta.changes };
    },
    async batch(stmts: DbStmt[]): Promise<DbRunResult[]> {
      const results = await d1.batch(stmts.map(toStmt));
      return results.map((r) => ({ changes: r.meta.changes }));
    },
  };
}

let d1SchemaReady: Promise<unknown> | null = null;

function ensureD1Schema(d1: D1Like): Promise<unknown> {
  // Idempotent (CREATE ... IF NOT EXISTS); runs once per isolate. Cheap on
  // cold start; a real migration workflow can replace this later.
  d1SchemaReady ??= d1
    .batch(
      SCHEMA.split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((sql) => d1.prepare(sql)),
    )
    .then(() => applyD1Migrations(d1))
    .catch((e) => {
      d1SchemaReady = null;
      throw e;
    });
  return d1SchemaReady;
}

/**
 * Column additions applied idempotently on top of SCHEMA for databases created
 * before the column existed. Duplicate-column errors are tolerated (the column
 * already exists from SCHEMA on fresh databases).
 */
const MIGRATIONS = ["ALTER TABLE purchases ADD COLUMN nonce TEXT"];

function applyD1Migrations(d1: D1Like): Promise<unknown> {
  return Promise.all(
    MIGRATIONS.map((sql) => d1.prepare(sql).run().catch(() => undefined)),
  );
}

async function getD1(): Promise<D1Like | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    // SAFETY: getCloudflareContext returns the Worker runtime context whose env
    // shape is only known at runtime; we only probe for an optional DB binding
    // and fall back to the local driver when absent.
    const d1 = (getCloudflareContext() as unknown as { env: { DB?: D1Like } }).env?.DB;
    return d1 ?? null;
  } catch {
    // No Cloudflare context (plain `next dev`, vitest): use the local driver.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let localDb: SqliteDb | null = null;

/** Returns the DB driver for the current runtime: D1 in Workers, SQLite locally. */
export async function getDb(): Promise<Db> {
  const d1 = await getD1();
  if (d1) {
    await ensureD1Schema(d1);
    return d1Driver(d1);
  }
  if (!localDb) localDb = openLocalDb();
  return localDriver(localDb);
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  balance_seconds INTEGER NOT NULL DEFAULT 0 CHECK (balance_seconds >= 0),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  gateway_ref TEXT,
  coin TEXT NOT NULL,
  address_in TEXT,
  seconds INTEGER NOT NULL,
  amount_usd_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','expired','underpaid')),
  created_at INTEGER NOT NULL,
  confirmed_at INTEGER,
  nonce TEXT
);

CREATE TABLE IF NOT EXISTS credit_txns (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  delta_seconds INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id),
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  billed_seconds INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_txns_user ON credit_txns(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);
`;

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
