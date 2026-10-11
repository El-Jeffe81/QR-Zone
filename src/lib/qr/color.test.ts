import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MIN_CONTRAST,
  TINT_AMOUNT,
  contrastRatio,
  contrastWarning,
  frameColorFor,
  luminance,
  mixColors,
} from "./color.ts";
import { DEFAULT_BG, DEFAULT_FG, SWATCHES } from "./settings.ts";

describe("luminance and contrast", () => {
  it("matches the WCAG reference values", () => {
    assert.equal(luminance("#000000"), 0);
    assert.equal(luminance("#ffffff"), 1);
    assert.equal(contrastRatio("#000000", "#ffffff"), 21);
    assert.equal(contrastRatio("#ffffff", "#ffffff"), 1);
    // #777777 on white is the well-known 4.48:1 just-below-AA case.
    assert.equal(contrastRatio("#777777", "#ffffff").toFixed(2), "4.48");
    assert.equal(contrastRatio("#767676", "#ffffff").toFixed(2), "4.54");
  });

  it("is symmetric, so light-on-dark scores the same as dark-on-light", () => {
    assert.equal(contrastRatio(DEFAULT_FG, DEFAULT_BG), contrastRatio(DEFAULT_BG, DEFAULT_FG));
  });
});

describe("contrastWarning", () => {
  it("warns below 4.5:1 and is silent at or above it", () => {
    assert.equal(MIN_CONTRAST, 4.5);
    assert.match(
      contrastWarning("#777777", "#ffffff") ?? "",
      /Contrast is 4\.4:1\..*at least 4\.5:1/,
    );
    assert.match(contrastWarning("#aaaaaa", "#f6f3ed") ?? "", /Contrast is 2\.0:1/);
    assert.equal(contrastWarning("#767676", "#ffffff"), null);
  });

  it("does not warn for any preset, including Inverse (light on dark)", () => {
    assert.ok(SWATCHES.some((swatch) => swatch.name === "Inverse"));
    for (const swatch of SWATCHES) {
      assert.equal(contrastWarning(swatch.fg, swatch.bg), null, swatch.name);
    }
  });
});

describe("frame colors", () => {
  it("mixes in sRGB, rounding each channel", () => {
    assert.equal(mixColors("#000000", "#ffffff", 0), "#000000");
    assert.equal(mixColors("#000000", "#ffffff", 1), "#ffffff");
    assert.equal(mixColors("#000000", "#ffffff", 0.5), "#808080");
    assert.equal(mixColors("#102030", "#102030", 0.7), "#102030");
  });

  it("match uses the code color, custom uses the picked color", () => {
    assert.equal(frameColorFor("match", DEFAULT_FG, DEFAULT_BG, "#123456"), DEFAULT_FG);
    assert.equal(frameColorFor("custom", DEFAULT_FG, DEFAULT_BG, "#123456"), "#123456");
  });

  it("the lighter tint sits between code and background, visibly softer than the code", () => {
    for (const swatch of SWATCHES) {
      const tint = frameColorFor("tint", swatch.fg, swatch.bg, "#000000");
      assert.equal(tint, mixColors(swatch.fg, swatch.bg, TINT_AMOUNT));
      const codeContrast = contrastRatio(swatch.fg, swatch.bg);
      const tintContrast = contrastRatio(tint, swatch.bg);
      // Still visible against the background, clearly weaker than the code.
      assert.ok(tintContrast > 1.5, `${swatch.name}: tint ${tintContrast.toFixed(2)}:1`);
      assert.ok(tintContrast < codeContrast / 2, `${swatch.name}: tint too close to the code`);
    }
  });
});
