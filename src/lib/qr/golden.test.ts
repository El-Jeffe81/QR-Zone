/**
 * Golden hashes: SHA-256 of fixed, seeded renders, one per frame shape with
 * the dot fill, plus one per framed shape with the solid fill.
 * Any change to the pixels (renderer, frame layout, PRNG, or the qrcode
 * encoder) fails this test, so visual changes are always deliberate.
 *
 * To accept an intentional change, regenerate the file and commit it with
 * the change that caused it:
 *
 *   npm run test:golden:update
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { CORNER_STYLES, DOT_SHAPES } from "./render.ts";
import { FRAME_SHAPES } from "./frames.ts";
import { frameColorFor } from "./color.ts";
import { INK, renderText } from "./test-support.ts";

const FILE = new URL("./golden-hashes.json", import.meta.url);
const TEXT = "https://el-jeffe81.github.io/QR-Zone/";

/** One fixed render per frame shape, cycling dot shapes, corners and colors. */
const DOT_CASES = FRAME_SHAPES.map((frameShape, index) => {
  const tint = index % 2 === 1;
  return {
    name: frameShape,
    options: {
      frameShape,
      dotShape: DOT_SHAPES[index % DOT_SHAPES.length],
      cornerStyle: CORNER_STYLES[index % CORNER_STYLES.length],
      modulePx: 6,
      frameColor: tint
        ? frameColorFor("tint", INK.foreground, INK.background, INK.foreground)
        : INK.foreground,
      seed: `golden:${frameShape}`,
    },
  };
});

/** The same renders with a solid frame, keyed "solid:<shape>". */
const SOLID_CASES = DOT_CASES.filter(({ name }) => name !== "none").map(({ name, options }) => ({
  name: `solid:${name}`,
  options: { ...options, frameFill: "solid" as const },
}));

const CASES = [...DOT_CASES, ...SOLID_CASES];

function hashRender(options: (typeof CASES)[number]["options"]) {
  const { image } = renderText(TEXT, options);
  return createHash("sha256")
    .update(`${image.width}x${image.height}:`)
    .update(image.data)
    .digest("hex");
}

const actual: Record<string, string> = Object.fromEntries(
  CASES.map(({ name, options }) => [name, hashRender(options)]),
);

if (process.env.UPDATE_GOLDEN === "1") {
  writeFileSync(FILE, `${JSON.stringify(actual, null, 2)}\n`);
}

describe("golden renders", () => {
  const expected = JSON.parse(readFileSync(FILE, "utf8")) as Record<string, string>;

  it("covers every frame shape once per fill", () => {
    const names = [
      ...FRAME_SHAPES,
      ...FRAME_SHAPES.filter((shape) => shape !== "none").map((shape) => `solid:${shape}`),
    ];
    assert.deepEqual(Object.keys(expected).sort(), names.sort());
  });

  for (const { name } of CASES) {
    it(`${name} matches its golden hash`, () => {
      assert.equal(
        actual[name],
        expected[name],
        `${name} pixels changed. If intended, run "npm run test:golden:update" and commit the JSON.`,
      );
    });
  }
});
