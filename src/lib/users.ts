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

export function createUser(email: string, password: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("invalid email");
  if (password.length < 8) throw new Error("password must be at least 8 characters");
  const id = newId("usr");
  try {
    getDb()
      .prepare("INSERT INTO users (id, email, password_hash, balance_seconds, created_at) VALUES (?,?,?,0,?)")
      .run(id, normalized, hashPassword(password), Date.now());
  } catch (e) {
    if (String((e as Error).message).includes("UNIQUE")) throw new Error("email already registered");
    throw e;
  }
  return id;
}

export function getUserByEmail(email: string): { id: string; email: string; password_hash: string; balance_seconds: number } | null {
  const row = getDb()
    .prepare("SELECT id, email, password_hash, balance_seconds FROM users WHERE email = ?")
    .get(email.trim().toLowerCase()) as { id: string; email: string; password_hash: string; balance_seconds: number } | undefined;
  return row ?? null;
}

export function getUserById(id: string): { id: string; email: string; balance_seconds: number } | null {
  const row = getDb()
    .prepare("SELECT id, email, balance_seconds FROM users WHERE id = ?")
    .get(id) as { id: string; email: string; balance_seconds: number } | undefined;
  return row ?? null;
}