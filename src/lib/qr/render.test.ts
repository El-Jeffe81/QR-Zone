import { describe, it } from "node:test";
import assert from "node:assert/strict";
import jsQR from "jsqr";
import { create } from "qrcode/lib/browser.js";
import { CORNER_STYLES, DOT_SHAPES, renderQr, type RenderOptions } from "./render.ts";

const INK = { foreground: "#1b1916", background: "#f6f3ed" };

function render(text: string, ecc: "L" | "M" | "Q" | "H", options: Partial<RenderOptions> = {}) {
  const symbol = create(text, { errorCorrectionLevel: ecc });
  const image = renderQr(symbol.modules, {
    modulePx: 8,
    quietModules: 4,
    dotShape: "square",
    cornerStyle: "square",
    ...INK,
    ...options,
  });
  return { symbol, image };
}

function decode(image: { data: Uint8ClampedArray; width: number; height: number }) {
  return jsQR(image.data, image.width, image.height)?.data ?? null;
}

const SAMPLES: { text: string; ecc: "L" | "M" | "Q" | "H"; modulePx: number }[] = [
  { text: "https://el-jeffe81.github.io/QR-Zone/", ecc: "M", modulePx: 8 },
  { text: "Hello", ecc: "H", modulePx: 4 },
  { text: "QR Zone · ünïcödé · 1234567890", ecc: "Q", modulePx: 16 },
  { text: "x".repeat(300), ecc: "L", modulePx: 5 },
];

describe("renderQr", () => {
  for (const dotShape of DOT_SHAPES) {
    for (const cornerStyle of CORNER_STYLES) {
      it(`${dotShape} dots with ${cornerStyle} corners decode to the input text`, () => {
        for (const { text, ecc, modulePx } of SAMPLES) {
          const { image } = render(text, ecc, { dotShape, cornerStyle, modulePx });
          assert.equal(decode(image), text, `${ecc}, ${modulePx}px: ${text.slice(0, 40)}`);
        }
      });
    }
  }

  it("every dot shape × corner style combination draws different pixels", () => {
    const seen = new Map<string, string>();
    for (const dotShape of DOT_SHAPES) {
      for (const cornerStyle of CORNER_STYLES) {
        const { image } = render("distinct", "M", { dotShape, cornerStyle });
        const key = Buffer.from(image.data).toString("base64");
        const combo = `${dotShape}/${cornerStyle}`;
        assert.equal(seen.get(key), undefined, `${combo} matches ${seen.get(key)}`);
        seen.set(key, combo);
      }
    }
  });

  it("light-on-dark colors still decode", () => {
    const text = "https://example.com/inverse";
    const { image } = render(text, "M", {
      foreground: INK.background,
      background: INK.foreground,
      dotShape: "rounded",
      cornerStyle: "circle",
    });
    assert.equal(decode(image), text);
  });

  it("sizes the image as (modules + 2 × quiet zone) × module size", () => {
    const { symbol, image } = render("size check", "M", { modulePx: 6 });
    const side = (symbol.modules.size + 8) * 6;
    assert.equal(image.width, side);
    assert.equal(image.height, side);
    assert.equal(image.data.length, side * side * 4);
  });

  it("square on square paints every module as a solid block, like the original canvas", () => {
    const modulePx = 5;
    const { symbol, image } = render("pixel exact", "M", { modulePx });
    const { size } = symbol.modules;
    const fg = [0x1b, 0x19, 0x16];
    const bg = [0xf6, 0xf3, 0xed];
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const row = Math.floor(y / modulePx) - 4;
        const col = Math.floor(x / modulePx) - 4;
        const dark =
          row >= 0 && col >= 0 && row < size && col < size && symbol.modules.get(row, col);
        const i = (y * image.width + x) * 4;
        assert.deepEqual([...image.data.subarray(i, i + 4)], [...(dark ? fg : bg), 255]);
      }
    }
  });

  it("keeps the quiet zone background-colored for every shape", () => {
    for (const dotShape of DOT_SHAPES) {
      for (const cornerStyle of CORNER_STYLES) {
        const { image } = render("quiet", "M", { dotShape, cornerStyle, modulePx: 4 });
        const band = 4 * 4;
        for (let y = 0; y < image.height; y += 1) {
          for (let x = 0; x < image.width; x += 1) {
            const inside =
              x >= band && y >= band && x < image.width - band && y < image.height - band;
            if (inside) continue;
            const i = (y * image.width + x) * 4;
            assert.deepEqual([...image.data.subarray(i, i + 3)], [0xf6, 0xf3, 0xed]);
          }
        }
      }
    }
  });

  it("rejects colors that are not #rrggbb", () => {
    assert.throws(() => render("bad", "M", { foreground: "red" }), /#rrggbb/);
  });
});
