import { describe, it, expect } from "vitest";
import { iconUrl } from "@/lib/icon-url";

describe("iconUrl", () => {
  it("reads .src from StaticImageData (webpack / next image-types)", () => {
    expect(iconUrl({ src: "/_next/static/media/btc.hash.svg", height: 30, width: 30 } as never)).toBe(
      "/_next/static/media/btc.hash.svg",
    );
  });

  it("reads .default from Turbopack ES asset modules", () => {
    expect(iconUrl({ default: "/_next/static/media/zec.hash.svg" })).toBe("/_next/static/media/zec.hash.svg");
  });

  it("passes plain URL strings through", () => {
    expect(iconUrl("/_next/static/media/usdt.hash.svg")).toBe("/_next/static/media/usdt.hash.svg");
  });

  it("returns empty string for a shape with neither field", () => {
    expect(iconUrl({})).toBe("");
  });
});