import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layout = readFileSync("src/app/layout.tsx", "utf8");

const css = readFileSync("src/app/globals.css", "utf8");

describe("mobile viewport meta", () => {
  it("layout exports a device-width viewport with initialScale 1", () => {
    expect(layout).toMatch(/export const viewport/);
    expect(layout).toMatch(/width:\s*"device-width"/);
    expect(layout).toMatch(/initialScale:\s*1/);
  });

  it("globals.css defines the 768px and 560px breakpoints", () => {
    expect(css).toMatch(/@media \(max-width: 768px\)/);
    expect(css).toMatch(/@media \(max-width: 560px\)/);
  });

  it("globals.css defines chat off-canvas sidebar classes", () => {
    expect(css).toMatch(/\.chat-shell/);
    expect(css).toMatch(/\.chat-sidebar/);
    expect(css).toMatch(/\.chat-backdrop/);
    expect(css).toMatch(/\.sidebar-open/);
  });

  it("globals.css defines responsive payment row classes", () => {
    expect(css).toMatch(/\.pay-flex/);
    expect(css).toMatch(/\.amount-row/);
  });
});