import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb, newId } from "@/lib/db";

/** scrypt hash: scrypt$N$salt$hash (all hex) — no external deps. */
export function hashPassword(password: string): string {
  const N = 16384, r = 8, p = 1;
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N, r, p });
  return `scrypt$${N}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, nStr, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt") return false;
  const hash = scryptSync(password, Buffer.from(saltHex, "hex"), hashHex.length / 2, { N: Number(nStr), r: 8, p: 1 });
  return timingSafeEqual(hash, Buffer.from(hashHex, "hex"));
}

export async function createUser(email: string, password: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("invalid email");
  if (password.length < 8) throw new Error("password must be at least 8 characters");
  const id = newId("usr");
  try {
    await (await getDb())
      .run("INSERT INTO users (id, email, password_hash, balance_seconds, created_at) VALUES (?,?,?,0,?)", id, normalized, hashPassword(password), Date.now());
  } catch (e) {
    if (String((e as Error).message).includes("UNIQUE")) throw new Error("email already registered");
    throw e;
  }
  return id;
}

/**
 * OAuth sign-in: find the local user by email, or create one with an
 * unusable password hash (OAuth users never sign in with a password).
 * Returns null for an invalid email.
 */
export async function upsertUserByEmail(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  const db = await getDb();
  const existing = await db.get<{ id: string }>("SELECT id FROM users WHERE email = ?", normalized);
  if (existing) return existing.id;
  const id = newId("usr");
  try {
    const throwaway = hashPassword(randomBytes(32).toString("hex"));
    await db.run("INSERT INTO users (id, email, password_hash, balance_seconds, created_at) VALUES (?,?,?,0,?)", id, normalized, throwaway, Date.now());
  } catch (e) {
    if (!String((e as Error).message).includes("UNIQUE")) throw e;
    // Concurrent insert won the race — fall back to a read.
    const row = await db.get<{ id: string }>("SELECT id FROM users WHERE email = ?", normalized);
    return row?.id ?? null;
  }
  return id;
}

export async function getUserByEmail(email: string): Promise<{ id: string; email: string; password_hash: string; balance_seconds: number } | null> {
  const row = await (await getDb())
    .get<{ id: string; email: string; password_hash: string; balance_seconds: number }>(
      "SELECT id, email, password_hash, balance_seconds FROM users WHERE email = ?",
      email.trim().toLowerCase(),
    );
  return row ?? null;
}

export async function getUserById(id: string): Promise<{ id: string; email: string; balance_seconds: number } | null> {
  const row = await (await getDb())
    .get<{ id: string; email: string; balance_seconds: number }>("SELECT id, email, balance_seconds FROM users WHERE id = ?", id);
  return row ?? null;
}
