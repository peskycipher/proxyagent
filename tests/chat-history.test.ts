import { describe, it, expect, afterEach } from "vitest";
import { trimHistory, historyBudgets } from "@/lib/chat-history";

describe("trimHistory", () => {
  const m = (role: string, content: string) => ({ role, content });

  it("keeps the last message even when it alone exceeds the char budget", () => {
    const big = m("user", "x".repeat(1000));
    expect(trimHistory([big], 10, 10)).toEqual([big]);
  });

  it("returns empty for empty history", () => {
    expect(trimHistory([], 40, 24_000)).toEqual([]);
  });

  it("keeps newest messages within the message-count budget", () => {
    const all = Array.from({ length: 10 }, (_, i) => m("user", `msg-${i}`));
    expect(trimHistory(all, 3, 1000)).toEqual(all.slice(-3));
  });

  it("keeps newest messages within the char budget", () => {
    const all = [m("user", "a".repeat(10)), m("assistant", "b".repeat(10)), m("user", "c".repeat(10))];
    // budget 25 chars: last (10) + one more (20 chars total) fits; adding the
    // third would hit 30 — stop.
    expect(trimHistory(all, 10, 25)).toEqual(all.slice(-2));
  });

  it("respects both budgets simultaneously and preserves order", () => {
    const all = [
      m("user", "drop"),
      m("assistant", "keep-1"),
      m("user", "keep-2"),
      m("assistant", "keep-3-last"),
    ];
    expect(trimHistory(all, 3, 100)).toEqual([all[1], all[2], all[3]]);
  });
});

describe("historyBudgets", () => {
  const OLD = process.env.CHAT_HISTORY_MAX_MESSAGES;
  const OLD_CHARS = process.env.CHAT_HISTORY_MAX_CHARS;

  it("defaults to 40 messages / 24000 chars", () => {
    delete process.env.CHAT_HISTORY_MAX_MESSAGES;
    delete process.env.CHAT_HISTORY_MAX_CHARS;
    expect(historyBudgets()).toEqual({ maxMessages: 40, maxChars: 24_000 });
  });

  it("reads overrides from env", () => {
    process.env.CHAT_HISTORY_MAX_MESSAGES = "5";
    process.env.CHAT_HISTORY_MAX_CHARS = "100";
    expect(historyBudgets()).toEqual({ maxMessages: 5, maxChars: 100 });
    delete process.env.CHAT_HISTORY_MAX_MESSAGES;
    delete process.env.CHAT_HISTORY_MAX_CHARS;
  });

  afterEach(() => {
    if (OLD !== undefined) process.env.CHAT_HISTORY_MAX_MESSAGES = OLD;
    else delete process.env.CHAT_HISTORY_MAX_MESSAGES;
    if (OLD_CHARS !== undefined) process.env.CHAT_HISTORY_MAX_CHARS = OLD_CHARS;
    else delete process.env.CHAT_HISTORY_MAX_CHARS;
  });
});