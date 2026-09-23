import { describe, it, expect, vi } from "vitest";
import { oauthVerifiedEmail } from "@/lib/oauth";

const okJson = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;

describe("oauthVerifiedEmail", () => {
  it("accepts a Google identity with email_verified=true", async () => {
    const email = await oauthVerifiedEmail(
      { provider: "google", access_token: "t" },
      { email: "user@gmail.com" },
      { email_verified: true, email: "user@gmail.com" },
    );
    expect(email).toBe("user@gmail.com");
  });

  it("rejects a Google identity with email_verified=false or missing", async () => {
    expect(
      await oauthVerifiedEmail({ provider: "google" }, { email: "x@gmail.com" }, { email_verified: false }),
    ).toBeNull();
    expect(await oauthVerifiedEmail({ provider: "google" }, { email: "x@gmail.com" }, {})).toBeNull();
  });

  it("accepts a GitHub identity whose /user/emails entry matches and is verified", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okJson([
        { email: "other@example.com", verified: true },
        { email: "Me@Example.com", verified: true },
      ]),
    );
    const email = await oauthVerifiedEmail(
      { provider: "github", access_token: "gho_token" },
      { email: "me@example.com" },
      undefined,
      fetchImpl,
    );
    expect(email).toBe("me@example.com");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/user/emails",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer gho_token" }) }),
    );
  });

  it("rejects a GitHub identity whose matching email entry is unverified", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okJson([{ email: "me@example.com", verified: false }]),
    );
    expect(
      await oauthVerifiedEmail({ provider: "github", access_token: "t" }, { email: "me@example.com" }, undefined, fetchImpl),
    ).toBeNull();
  });

  it("rejects a GitHub identity when the API fails or the email is absent from the list", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("network down"));
    expect(
      await oauthVerifiedEmail({ provider: "github", access_token: "t" }, { email: "me@example.com" }, undefined, failing),
    ).toBeNull();
    const noMatch = vi.fn().mockResolvedValue(okJson([{ email: "someone-else@example.com", verified: true }]));
    expect(
      await oauthVerifiedEmail({ provider: "github", access_token: "t" }, { email: "me@example.com" }, undefined, noMatch),
    ).toBeNull();
    const notOk = vi.fn().mockResolvedValue({ ok: false, json: async () => [] } as unknown as Response);
    expect(
      await oauthVerifiedEmail({ provider: "github", access_token: "t" }, { email: "me@example.com" }, undefined, notOk),
    ).toBeNull();
  });

  it("fails closed for unknown providers and missing inputs", async () => {
    expect(await oauthVerifiedEmail({ provider: "twitter", access_token: "t" }, { email: "a@b.co" })).toBeNull();
    expect(await oauthVerifiedEmail(null, { email: "a@b.co" })).toBeNull();
    expect(await oauthVerifiedEmail({ provider: "google" }, null)).toBeNull();
    expect(await oauthVerifiedEmail({ provider: "google" }, { email: null })).toBeNull();
    // GitHub without an access token cannot be verified — deny.
    expect(await oauthVerifiedEmail({ provider: "github" }, { email: "me@example.com" })).toBeNull();
  });
});