import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const file = process.env.APP_DB_PATH || process.env.DB_PATH || path.join(process.cwd(), "data", "app.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
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
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','expired')),
  created_at INTEGER NOT NULL,
  confirmed_at INTEGER
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