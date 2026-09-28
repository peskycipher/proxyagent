import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layout = readFileSync("src/app/layout.tsx", "utf8");

describe("mobile viewport meta", () => {
  it("layout exports a device-width viewport with initialScale 1", () => {
    expect(layout).toMatch(/export const viewport/);
    expect(layout).toMatch(/width:\s*"device-width"/);
    expect(layout).toMatch(/initialScale:\s*1/);
  });
});