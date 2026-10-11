import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, SWATCHES, parseSettings, serializeSettings } from "./settings.ts";

describe("swatches", () => {
  it("offers Ink and Inverse, and no longer Signal", () => {
    assert.deepEqual(
      SWATCHES.map((swatch) => swatch.name),
      ["Ink", "Inverse"],
    );
    assert.equal(
      SWATCHES.some((swatch) => swatch.name === "Signal" || swatch.fg === "#8e3e1c"),
      false,
    );
  });
});

describe("parseSettings", () => {
  it("loads settings saved before dot shape and corner style existed, defaulting both to square", () => {
    const old = JSON.stringify({
      content: "https://example.com",
      fg: "#8E3E1C",
      bg: "#f6f3ed",
      ecc: "Q",
      moduleSize: 12,
    });
    assert.deepEqual(parseSettings(old), {
      content: "https://example.com",
      fg: "#8e3e1c",
      bg: "#f6f3ed",
      ecc: "Q",
      moduleSize: 12,
      dotShape: "square",
      cornerStyle: "square",
    });
  });

  it("round-trips the shape choices", () => {
    const saved = {
      ...DEFAULT_SETTINGS,
      content: "hi",
      dotShape: "dots",
      cornerStyle: "circle",
    } as const;
    assert.deepEqual(parseSettings(serializeSettings(saved)), saved);
  });

  it("falls back to defaults for unknown or invalid values", () => {
    const parsed = parseSettings(
      JSON.stringify({
        content: 42,
        fg: "red",
        ecc: "X",
        moduleSize: 99,
        dotShape: "hexagon",
        cornerStyle: null,
      }),
    );
    assert.deepEqual(parsed, DEFAULT_SETTINGS);
  });

  it("treats missing, malformed or non-object data as defaults", () => {
    for (const raw of [null, undefined, "", "not json", "[]", "null", "7"]) {
      assert.deepEqual(parseSettings(raw), DEFAULT_SETTINGS, String(raw));
    }
  });
});
