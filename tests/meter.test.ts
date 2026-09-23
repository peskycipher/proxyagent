import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Meter } from "@/lib/meter";

describe("meter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("bills wall-clock seconds from start to stop", () => {
    const m = new Meter();
    vi.advanceTimersByTime(1500);
    expect(m.stop()).toBe(2); // ceil(1.5s)
  });

  it("bills a minimum of 1 second", () => {
    const m = new Meter();
    expect(m.stop()).toBe(1);
  });

  it("only bills once", () => {
    const m = new Meter();
    vi.advanceTimersByTime(4000);
    expect(m.stop()).toBe(4);
    expect(m.stop()).toBe(4); // frozen
  });
});
