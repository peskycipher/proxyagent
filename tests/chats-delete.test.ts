import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";
import type { Db } from "@/lib/db";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

const TMP = path.join(process.cwd(), "data", "test-chats-delete.db");

interface Fresh {
  db: Db;
  DELETE: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
}

async function fresh(): Promise<Fresh> {
  fs.mkdirSync(path.dirname(TMP), { recursive: true });
  if (fs.existsSync(TMP)) fs.rmSync(TMP);
  process.env.APP_DB_PATH = TMP;
  const dbModule = await import("@/lib/db");
  const route = await import("@/app/api/chats/[id]/route");
  return { db: await dbModule.getDb(), DELETE: route.DELETE as unknown as Fresh["DELETE"] };
}

async function seed(db: Db, chatId: string) {
  await db.run("INSERT OR IGNORE INTO users (id, email, password_hash, balance_seconds, created_at) VALUES (?, ?, ?, ?, ?)", "u1", "u1@example.com", "x", 0, Date.now());
  await db.run("INSERT OR IGNORE INTO users (id, email, password_hash, balance_seconds, created_at) VALUES (?, ?, ?, ?, ?)", "u2", "u2@example.com", "x", 0, Date.now());
  await db.run("INSERT INTO chats (id, user_id, title, created_at) VALUES (?, ?, ?, ?)", chatId, "u1", "hello", Date.now());
  await db.run("INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)", `m_${chatId}`, chatId, "user", "hi", Date.now());
}

beforeEach(() => {
  authMock.mockResolvedValue({ user: { id: "u1" } });
});

afterEach(() => {
  if (fs.existsSync(TMP)) fs.rmSync(TMP);
  delete process.env.APP_DB_PATH;
  authMock.mockReset();
});

describe("DELETE /api/chats/[id]", () => {
  it("removes the chat and its messages for the owner", async () => {
    const { db, DELETE } = await fresh();
    await seed(db, "c_del");
    const res = await DELETE(new Request("http://x"), { params: Promise.resolve({ id: "c_del" }) });
    expect(res.status).toBe(200);
    expect(await db.get("SELECT id FROM chats WHERE id = ?", "c_del")).toBeUndefined();
    expect(await db.get("SELECT id FROM messages WHERE chat_id = ?", "c_del")).toBeUndefined();
  });

  it("returns 404 when the chat belongs to another user", async () => {
    const { db, DELETE } = await fresh();
    await seed(db, "c_foreign");
    await db.run("UPDATE chats SET user_id = ? WHERE id = ?", "u2", "c_foreign");
    const res = await DELETE(new Request("http://x"), { params: Promise.resolve({ id: "c_foreign" }) });
    expect(res.status).toBe(404);
    expect(await db.get("SELECT id FROM chats WHERE id = ?", "c_foreign")).toBeDefined();
    expect(await db.get("SELECT id FROM messages WHERE chat_id = ?", "c_foreign")).toBeDefined();
  });

  it("returns 401 when unauthenticated", async () => {
    const { db, DELETE } = await fresh();
    await seed(db, "c_authz");
    authMock.mockResolvedValueOnce(null);
    const res = await DELETE(new Request("http://x"), { params: Promise.resolve({ id: "c_authz" }) });
    expect(res.status).toBe(401);
    expect(await db.get("SELECT id FROM chats WHERE id = ?", "c_authz")).toBeDefined();
  });
});