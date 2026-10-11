import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS,
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  SWATCHES,
  migrateLegacySettings,
  parseSettings,
  serializeSettings,
} from "./settings.ts";

function memoryStorage(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

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

describe("migrateLegacySettings", () => {
  const saved = JSON.stringify({ content: "from before the rename", ecc: "H", dotShape: "dots" });

  it("uses the renamed key", () => {
    assert.equal(STORAGE_KEY, "qr-zone:v1");
    assert.equal(LEGACY_STORAGE_KEY, "quiet-zone:v1");
  });

  it("copies quiet-zone:v1 into qr-zone:v1 once, keeping the old key", () => {
    const storage = memoryStorage({ [LEGACY_STORAGE_KEY]: saved });
    assert.equal(migrateLegacySettings(storage), true);
    assert.equal(storage.getItem(STORAGE_KEY), saved);
    assert.equal(storage.getItem(LEGACY_STORAGE_KEY), saved);
    const loaded = parseSettings(storage.getItem(STORAGE_KEY));
    assert.equal(loaded.content, "from before the rename");
    assert.equal(loaded.ecc, "H");
    assert.equal(loaded.dotShape, "dots");
    assert.equal(loaded.cornerStyle, "square");
    // Second run is a no-op.
    assert.equal(migrateLegacySettings(storage), false);
  });

  it("never overwrites settings already saved under the new key", () => {
    const current = JSON.stringify({ content: "current" });
    const storage = memoryStorage({ [STORAGE_KEY]: current, [LEGACY_STORAGE_KEY]: saved });
    assert.equal(migrateLegacySettings(storage), false);
    assert.equal(storage.getItem(STORAGE_KEY), current);
  });

  it("does nothing when there is no old data", () => {
    const storage = memoryStorage();
    assert.equal(migrateLegacySettings(storage), false);
    assert.equal(storage.map.size, 0);
  });
});
