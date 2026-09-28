import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";

const TMP = path.join(process.cwd(), "data", "test-linked-accounts.db");

async function fresh() {
  vi.resetModules();
  fs.mkdirSync(path.dirname(TMP), { recursive: true });
  if (fs.existsSync(TMP)) fs.rmSync(TMP);
  process.env.APP_DB_PATH = TMP;
  const dbMod = await import("@/lib/db");
  const mod = await import("@/lib/linked-accounts");
  const usersMod = await import("@/lib/users");
  const db = await dbMod.getDb();
  return { db, ...mod, ...usersMod };
}

afterEach(() => {
  if (fs.existsSync(TMP)) fs.rmSync(TMP);
  delete process.env.APP_DB_PATH;
  vi.resetModules();
});

describe("linked accounts", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("round-trips: upsert then list", async () => {
    const f = await fresh();
    const userId = await f.createUser("a@example.com", "password123");
    expect(await f.upsertLinkedAccount(userId, "google", "gid-1", "a@example.com", null)).toEqual({ ok: true });
    const rows = await f.listLinkedAccounts(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider: "google", provider_account_id: "gid-1", provider_email: "a@example.com" });
  });

  it("re-linking the same provider updates the identity (idempotent)", async () => {
    const f = await fresh();
    const userId = await f.createUser("b@example.com", "password123");
    await f.upsertLinkedAccount(userId, "github", "gh-old", null, null);
    await f.upsertLinkedAccount(userId, "github", "gh-new", "b@example.com", null);
    const rows = await f.listLinkedAccounts(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].provider_account_id).toBe("gh-new");
  });

  it("refuses to bind a provider identity already linked to another user", async () => {
    const f = await fresh();
    const first = await f.createUser("c@example.com", "password123");
    const second = await f.createUser("d@example.com", "password123");
    await f.upsertLinkedAccount(first, "google", "shared-gid", "c@example.com", null);
    expect(await f.upsertLinkedAccount(second, "google", "shared-gid", "d@example.com", null)).toEqual({
      ok: false,
      reason: "in-use",
    });
    // The first user's link is untouched.
    expect(await f.listLinkedAccounts(second)).toHaveLength(0);
    expect(await f.listLinkedAccounts(first)).toHaveLength(1);
  });

  it("removeLinkedAccount deletes only the given provider", async () => {
    const f = await fresh();
    const userId = await f.createUser("e@example.com", "password123");
    await f.upsertLinkedAccount(userId, "google", "gid-1", null, null);
    await f.upsertLinkedAccount(userId, "github", "gh-1", null, null);
    expect(await f.removeLinkedAccount(userId, "google")).toBe(true);
    expect(await f.removeLinkedAccount(userId, "google")).toBe(false);
    const rows = await f.listLinkedAccounts(userId);
    expect(rows.map((r) => r.provider)).toEqual(["github"]);
  });

  it("rejects unsupported providers via the CHECK constraint", async () => {
    const f = await fresh();
    const userId = await f.createUser("f@example.com", "password123");
    await expect(f.upsertLinkedAccount(userId, "facebook", "x", null, null)).rejects.toThrow();
  });

  it("provider availability follows the configured env keys", async () => {
    const f = await fresh();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_ID;
    expect(f.availableProviders()).toEqual([]);
    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    expect(f.availableProviders()).toEqual(["google"]);
    process.env.GITHUB_CLIENT_ID = "id";
    process.env.GITHUB_CLIENT_SECRET = "secret";
    expect(f.availableProviders()).toEqual(["google", "github"]);
  });

  it("providerPictureFromProfile extracts https picture URLs only", async () => {
    const f = await fresh();
    expect(f.providerPictureFromProfile({ picture: "https://lh3.googleusercontent.com/a/x" })).toBe(
      "https://lh3.googleusercontent.com/a/x",
    );
    expect(f.providerPictureFromProfile({ avatar_url: "https://avatars.githubusercontent.com/u/1" })).toBe(
      "https://avatars.githubusercontent.com/u/1",
    );
    expect(f.providerPictureFromProfile({ avatar_url: "http://insecure.example/x" })).toBeNull();
    expect(f.providerPictureFromProfile({ picture: 42 })).toBeNull();
    expect(f.providerPictureFromProfile({})).toBeNull();
    expect(f.providerPictureFromProfile(null)).toBeNull();
  });

  it("stores and serves the provider picture as the avatar fallback", async () => {
    const f = await fresh();
    const userId = await f.createUser("g@example.com", "password123");
    await f.upsertLinkedAccount(userId, "google", "gid-1", "g@example.com", "https://lh3.googleusercontent.com/a/x");
    expect(await f.linkedAvatarFor(userId)).toBe("https://lh3.googleusercontent.com/a/x");

    // Google wins over GitHub regardless of link order.
    await f.upsertLinkedAccount(userId, "github", "gh-1", null, "https://avatars.githubusercontent.com/u/1");
    expect(await f.linkedAvatarFor(userId)).toBe("https://lh3.googleusercontent.com/a/x");

    // …and GitHub alone serves its own picture.
    await f.upsertLinkedAccount(userId, "google", "gid-1", "g@example.com", null);
    expect(await f.linkedAvatarFor(userId)).toBe("https://avatars.githubusercontent.com/u/1");
  });

  it("synthesizes the GitHub avatar from the numeric account id when no URL is stored", async () => {
    const f = await fresh();
    const userId = await f.createUser("h@example.com", "password123");
    await f.upsertLinkedAccount(userId, "github", "1234567", null, null);
    expect(await f.linkedAvatarFor(userId)).toBe("https://avatars.githubusercontent.com/u/1234567?v=4");
  });

  it("returns null for a pictureless GitHub row with a non-numeric account id", async () => {
    const f = await fresh();
    const userId = await f.createUser("i@example.com", "password123");
    await f.upsertLinkedAccount(userId, "github", "not-numeric", null, null);
    expect(await f.linkedAvatarFor(userId)).toBeNull();
  });

  it("returns null for a pictureless Google row (no public by-id endpoint)", async () => {
    const f = await fresh();
    const userId = await f.createUser("j@example.com", "password123");
    await f.upsertLinkedAccount(userId, "google", "sub-123", null, null);
    expect(await f.linkedAvatarFor(userId)).toBeNull();
  });
});