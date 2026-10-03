import { describe, expect, it } from "vitest";
import { mapVastStatus } from "@/lib/vast";

describe("mapVastStatus", () => {
  it("maps running", () => {
    expect(mapVastStatus("running")).toEqual({ status: "RUNNING", actions: ["stop"] });
  });
  it("maps loading to STARTING (decideStart: wait)", () => {
    expect(mapVastStatus("loading")).toEqual({ status: "STARTING", actions: ["start"] });
  });
  it("maps restartable states to EXITED+start (decideStart: start)", () => {
    for (const s of ["stopped", "exited", "created"]) {
      expect(mapVastStatus(s)).toEqual({ status: "EXITED", actions: ["start"] });
    }
  });
  it("maps destroyed to ERROR (decideStart: error — volume is gone)", () => {
    expect(mapVastStatus("destroyed")).toEqual({ status: "ERROR", actions: [] });
  });
  it("maps error to EXITED+start (restartable — budget host 27389 self-recovers; console remedy is restart)", () => {
    expect(mapVastStatus("error")).toEqual({ status: "EXITED", actions: ["start"] });
  });
  it("treats unknown states as restartable, not fatal", () => {
    expect(mapVastStatus("something-new")).toEqual({ status: "EXITED", actions: ["start"] });
  });
});