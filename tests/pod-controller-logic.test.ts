import { describe, it, expect } from "vitest";
import {
  decideStart,
  decideAlarmAction,
  LeaseRegistry,
  STREAM_LEASE_TTL_MS,
} from "@/lib/pod/logic";

describe("decideStart (v2 snapshot → transition decision)", () => {
  it("RUNNING needs no start call — avoids the duplicate-start 409 race", () => {
    expect(decideStart({ status: "RUNNING", actions: ["stop"] })).toBe("noop-running");
  });

  it("STARTING/PROVISIONING waits instead of re-issuing start", () => {
    // A concurrent request already triggered the start; a second POST /action
    // would 409 and (pre-redesign) fail the chat.
    expect(decideStart({ status: "STARTING", actions: [] })).toBe("wait");
    expect(decideStart({ status: "PROVISIONING", actions: ["start"] })).toBe("wait");
  });

  it("stopped pods start only when Runpod advertises the action", () => {
    expect(decideStart({ status: "EXITED", actions: ["start", "delete"] })).toBe("start");
  });

  it("no start action available → wait, not a doomed start call", () => {
    expect(decideStart({ status: "EXITED", actions: [] })).toBe("wait");
  });

  it("ERROR and TERMINATED are terminal", () => {
    expect(decideStart({ status: "ERROR", actions: ["start"] })).toBe("error");
    expect(decideStart({ status: "TERMINATED", actions: [] })).toBe("error");
  });
});

describe("decideAlarmAction (idle stop vs re-arm)", () => {
  const now = 1_000_000;

  it("a live stream lease prevents the stop even past the idle window", () => {
    // A stream that stopped emitting chunks but is still connected (long
    // prompt eval) must not lose its pod mid-request.
    const decision = decideAlarmAction({
      now,
      lastActivityAt: now - 10 * 60_000, // long past the idle window
      liveLeaseCount: 1,
      idleTimeoutMs: 600_000,
    });
    expect(decision).toEqual({ action: "rearm", alarmAt: now + 30_000 });
  });

  it("idle window not yet elapsed → re-arm at exactly lastActivity+timeout", () => {
    const lastActivityAt = now - 100_000;
    const decision = decideAlarmAction({
      now,
      lastActivityAt,
      liveLeaseCount: 0,
      idleTimeoutMs: 600_000,
    });
    expect(decision).toEqual({ action: "rearm", alarmAt: lastActivityAt + 600_000 });
  });

  it("idle past the window with no leases → stop", () => {
    const decision = decideAlarmAction({
      now,
      lastActivityAt: now - 700_000,
      liveLeaseCount: 0,
      idleTimeoutMs: 600_000,
    });
    expect(decision).toEqual({ action: "stop" });
  });
});

describe("LeaseRegistry (stream leases)", () => {
  it("begin/live/sweep — expired leases are dropped by live()", () => {
    const r = new LeaseRegistry();
    r.begin("u1", 1000, STREAM_LEASE_TTL_MS);
    expect(r.live(2000)).toEqual(["u1"]);
    expect(r.live(1000 + STREAM_LEASE_TTL_MS + 1)).toEqual([]); // expired → swept
    expect(r.size()).toBe(0);
  });

  it("renew extends only existing leases (unknown stream is a no-op)", () => {
    const r = new LeaseRegistry();
    r.renew("ghost", 1000, 90_000);
    expect(r.size()).toBe(0);
    r.begin("u1", 1000, 90_000);
    r.renew("u1", 5000, 90_000);
    // Renewal moved expiry to 5000+90_000 = 95_000 (strict > expiry).
    expect(r.live(95_000 - 1)).toEqual(["u1"]); // live up to (not incl.) expiry
    expect(r.live(95_000)).toEqual([]);
  });

  it("end releases the lease", () => {
    const r = new LeaseRegistry();
    r.begin("u1", 1000, 90_000);
    r.end("u1");
    expect(r.live(1001)).toEqual([]);
  });
});