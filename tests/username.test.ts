import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";

const TMP = path.join(process.cwd(), "data", "test-username.db");

async function fresh() {
  vi.resetModules();
  fs.mkdirSync(path.dirname(TMP), { recursive: true });
  if (fs.existsSync(TMP)) fs.rmSync(TMP);
  process.env.APP_DB_PATH = TMP;
  const dbMod = await import("@/lib/db");
  const mod = await import("@/lib/users");
  const db = await dbMod.getDb();
  return { db, ...mod };
}

afterEach(() => {
  if (fs.existsSync(TMP)) fs.rmSync(TMP);
  delete process.env.APP_DB_PATH;
  vi.resetModules();
});

describe("setUsername", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("sets and reads back the username", async () => {
    const f = await fresh();
    const id = await f.createUser("u@example.com", "password123");
    expect(await f.setUsername(id, "ada_l")).toEqual({ ok: true });
    expect((await f.getUserById(id))?.username).toBe("ada_l");
  });

  it("rejects a username already held by another user", async () => {
    const f = await fresh();
    const a = await f.createUser("a@example.com", "password123");
    const b = await f.createUser("b@example.com", "password123");
    await f.setUsername(a, "shared");
    expect(await f.setUsername(b, "shared")).toEqual({ ok: false, reason: "taken" });
    // The failed write must not have changed the other user's username.
    expect((await f.getUserById(a))?.username).toBe("shared");
  });

  it("clears with an empty username", async () => {
    const f = await fresh();
    const id = await f.createUser("c@example.com", "password123");
    await f.setUsername(id, "temp");
    expect(await f.setUsername(id, "")).toEqual({ ok: true });
    expect((await f.getUserById(id))?.username).toBeNull();
  });

  it("a cleared username frees the value for another user", async () => {
    const f = await fresh();
    const a = await f.createUser("d@example.com", "password123");
    const b = await f.createUser("e@example.com", "password123");
    await f.setUsername(a, "recycled");
    await f.setUsername(a, "");
    expect(await f.setUsername(b, "recycled")).toEqual({ ok: true });
  });
});