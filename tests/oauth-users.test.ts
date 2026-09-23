import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";

const TMP = path.join(process.cwd(), "data", "test-oauth-users.db");

async function fresh() {
  vi.resetModules();
  fs.mkdirSync(path.dirname(TMP), { recursive: true });
  if (fs.existsSync(TMP)) fs.rmSync(TMP);
  process.env.APP_DB_PATH = TMP;
  const dbMod = await import("@/lib/db");
  const usersMod = await import("@/lib/users");
  return { db: await dbMod.getDb(), ...usersMod };
}

afterEach(() => {
  if (fs.existsSync(TMP)) fs.rmSync(TMP);
  delete process.env.APP_DB_PATH;
  vi.resetModules();
});

describe("upsertUserByEmail (OAuth linking)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("creates a user with an unusable password and returns the id", async () => {
    const { upsertUserByEmail, getUserByEmail } = await fresh();
    const id = await upsertUserByEmail("someone@example.com");
    expect(id).toMatch(/^usr_/);
    const user = await getUserByEmail("someone@example.com");
    expect(user?.id).toBe(id);
    // The stored hash must never verify a real password.
    expect(user?.password_hash).toMatch(/^scrypt\$/);
  });

  it("returns the same id on repeat sign-in (idempotent)", async () => {
    const { upsertUserByEmail } = await fresh();
    const first = await upsertUserByEmail("repeat@example.com");
    const second = await upsertUserByEmail("repeat@example.com");
    expect(second).toBe(first);
  });

  it("normalizes the email", async () => {
    const { upsertUserByEmail } = await fresh();
    const a = await upsertUserByEmail("  Mixed@Example.COM ");
    const b = await upsertUserByEmail("mixed@example.com");
    expect(b).toBe(a);
  });

  it("links to an existing credentials account with the same email", async () => {
    const { createUser, upsertUserByEmail, getUserByEmail, verifyPassword } = await fresh();
    const credsId = await createUser("linkme@example.com", "supersecret1");
    const oauthId = await upsertUserByEmail("linkme@example.com");
    expect(oauthId).toBe(credsId);
    // Password sign-in still works for the linked account.
    expect(verifyPassword("supersecret1", (await getUserByEmail("linkme@example.com"))!.password_hash)).toBe(true);
  });

  it("returns null for an invalid email", async () => {
    const { upsertUserByEmail } = await fresh();
    expect(await upsertUserByEmail("not-an-email")).toBeNull();
    expect(await upsertUserByEmail("")).toBeNull();
  });
});