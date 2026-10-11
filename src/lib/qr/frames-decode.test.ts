/**
 * Framed codes must still scan: every frame with every dot shape and corner
 * style, the smallest and largest module sizes in both frame color modes, a
 * second decoder (ZXing), and a softened half-size copy like a phone camera
 * might see.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { frameColorFor } from "./color.ts";
import { FRAME_SHAPES } from "./frames.ts";
import { CORNER_STYLES, DOT_SHAPES } from "./render.ts";
import { MODULE_MAX, MODULE_MIN } from "./settings.ts";
import { INK, blur, decodeJsqr, decodeZxing, downscaleHalf, renderText } from "./test-support.ts";

const TEXT = "https://el-jeffe81.github.io/QR-Zone/";
const TINT = frameColorFor("tint", INK.foreground, INK.background, INK.foreground);

describe("framed codes decode (jsqr)", () => {
  for (const frameShape of FRAME_SHAPES) {
    it(`${frameShape}: every dot shape × corner style at 8 px, frame matching the code`, () => {
      for (const dotShape of DOT_SHAPES) {
        for (const cornerStyle of CORNER_STYLES) {
          const { image } = renderText(TEXT, { frameShape, dotShape, cornerStyle, modulePx: 8 });
          assert.equal(decodeJsqr(image), TEXT, `${dotShape}/${cornerStyle}`);
        }
      }
    });

    it(`${frameShape}: smallest and largest module size, match and tint frame colors`, () => {
      for (const modulePx of [MODULE_MIN, MODULE_MAX]) {
        for (const [mode, frameColor] of [
          ["match", INK.foreground],
          ["tint", TINT],
        ]) {
          const { image } = renderText(TEXT, {
            frameShape,
            frameColor,
            modulePx,
            dotShape: "rounded",
            cornerStyle: "rounded",
          });
          assert.equal(decodeJsqr(image), TEXT, `${modulePx}px, ${mode}`);
        }
      }
    });
  }
});

describe("framed codes decode (ZXing)", () => {
  for (const frameShape of FRAME_SHAPES) {
    it(`${frameShape}: dots with circle corners at 6 px`, () => {
      const { image } = renderText(TEXT, {
        frameShape,
        dotShape: "dots",
        cornerStyle: "circle",
        modulePx: 6,
      });
      assert.equal(decodeZxing(image), TEXT);
    });
  }
});

describe("framed codes survive a soft, half-size copy", () => {
  for (const frameShape of FRAME_SHAPES) {
    it(`${frameShape}: 50% downscale with smoothing and a mild blur still decodes`, () => {
      const { image } = renderText(TEXT, {
        frameShape,
        dotShape: "rounded",
        cornerStyle: "rounded",
        modulePx: 8,
      });
      const soft = blur(downscaleHalf(image));
      assert.equal(soft.width, Math.floor(image.width / 2));
      assert.equal(decodeJsqr(soft), TEXT);
    });
  }
});
