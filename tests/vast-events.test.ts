import { describe, it, expect } from "vitest";
import { mapVastEvent, mentionsOtherInstance } from "@/lib/vast-events";

describe("mapVastEvent", () => {
  it("maps instance lifecycle events to backend states", () => {
    expect(mapVastEvent("instance_started")).toMatchObject({ state: "live", notifType: "instance_started" });
    expect(mapVastEvent("instance_online")).toMatchObject({ state: "live" });
    expect(mapVastEvent("instance_resumed")).toMatchObject({ state: "live" });
    expect(mapVastEvent("instance_stopped")).toMatchObject({ state: "idle" });
    expect(mapVastEvent("instance_offline")).toMatchObject({ state: "idle" });
    expect(mapVastEvent("instance_created")).toMatchObject({ state: "idle" });
    expect(mapVastEvent("instance_deleted")).toMatchObject({ state: "error" });
    expect(mapVastEvent("error_msgs")).toMatchObject({ state: "error" });
    expect(mapVastEvent("machine_maintenance")).toMatchObject({ state: "idle" });
  });

  it("strips the client: prefix vast prefixes onto event_types", () => {
    expect(mapVastEvent("client:instance_started")?.notifType).toBe("instance_started");
    expect(mapVastEvent("client:instance_stopped")?.state).toBe("idle");
  });

  it("maps ops/billing events to null — never surfaced to the chat box", () => {
    expect(mapVastEvent("low_credit")).toBeNull();
    expect(mapVastEvent("client:billing_failed")).toBeNull();
    expect(mapVastEvent("outbid")).toBeNull();
    expect(mapVastEvent("low_disk_space")).toBeNull();
    expect(mapVastEvent("storage_full")).toBeNull();
    expect(mapVastEvent("upcoming_downtime")).toBeNull();
    expect(mapVastEvent("unknown_future_type")).toBeNull();
  });
});

describe("mentionsOtherInstance", () => {
  const OURS = "54026402";

  it("ignores events with a different instance id in id-ish fields", () => {
    expect(mentionsOtherInstance({ id: 99999999 }, OURS)).toBe(true);
    expect(mentionsOtherInstance({ instance_id: "99999999" }, OURS)).toBe(true);
  });

  it("ignores events whose subject/message references another instance", () => {
    expect(mentionsOtherInstance({ subject: "Instance 99999999 stopped" }, OURS)).toBe(true);
    expect(mentionsOtherInstance({ message: "instance 123456 error" }, OURS)).toBe(true);
  });

  it("keeps events about our instance, whatever field they name it in", () => {
    expect(mentionsOtherInstance({ id: 54026402 }, OURS)).toBe(false);
    expect(mentionsOtherInstance({ subject: "Instance 54026402 started" }, OURS)).toBe(false);
    expect(mentionsOtherInstance({ message: "Instance 54026402 error", id: 54026402 }, OURS)).toBe(false);
  });

  it("keeps unidentifiable events (account webhook serves this one instance)", () => {
    expect(mentionsOtherInstance({}, OURS)).toBe(false);
    expect(mentionsOtherInstance({ subject: "Billing error" }, OURS)).toBe(false);
  });

  it("is permissive when no instance id is configured", () => {
    expect(mentionsOtherInstance({ id: 99999999 }, "")).toBe(false);
  });
});