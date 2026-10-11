import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FRAME_GAP,
  FRAME_MARGIN,
  FRAME_SHAPES,
  decorCells,
  frameLayout,
  hashString,
  insideLayout,
  seededRandom,
} from "./frames.ts";
import { DOT_SHAPES, MAX_SIDE_PX } from "./render.ts";
import { INK, renderText } from "./test-support.ts";

const FRAMED = FRAME_SHAPES.filter((shape) => shape !== "none");
/** Symbol sizes from version 1 (21 modules) to version 40 (177 modules). */
const SIZES = [21, 25, 33, 57, 101, 177];
const TEXT = "https://el-jeffe81.github.io/QR-Zone/";

function rgb(hex: string) {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
}

describe("frame layout geometry", () => {
  it("lists None first and the seven shapes in UI order", () => {
    assert.deepEqual(FRAME_SHAPES, [
      "none",
      "circle",
      "rounded",
      "diamond",
      "triangle",
      "hexagon",
      "star",
      "heart",
    ]);
  });

  it("None is the classic code plus quiet zone", () => {
    for (const size of SIZES) {
      const layout = frameLayout(size, "none", 4);
      assert.equal(layout.side, size + 8);
      assert.equal(layout.qrRow, 4);
      assert.equal(layout.qrCol, 4);
    }
  });

  for (const shape of FRAMED) {
    it(`${shape}: the QR plus its ${FRAME_GAP}-module gap sits fully inside the shape`, () => {
      for (const size of SIZES) {
        const layout = frameLayout(size, shape, 4);
        const top = layout.qrRow - FRAME_GAP;
        const left = layout.qrCol - FRAME_GAP;
        const end = size + FRAME_GAP * 2;
        // Walk the outline of the QR + gap square every quarter module.
        for (let t = 0; t <= end; t += 0.25) {
          for (const [x, y] of [
            [left + t, top],
            [left + t, top + end],
            [left, top + t],
            [left + end, top + t],
          ]) {
            assert.ok(insideLayout(shape, layout, x, y), `${shape} ${size}: (${x}, ${y}) outside`);
          }
        }
      }
    });

    it(`${shape}: the whole shape stays on the canvas with a ${FRAME_MARGIN}-module margin`, () => {
      for (const size of SIZES) {
        const layout = frameLayout(size, shape, 4);
        const { side } = layout;
        for (let t = 0; t <= side; t += 0.5) {
          for (const [x, y] of [
            [t, FRAME_MARGIN - 0.01],
            [t, side - FRAME_MARGIN + 0.01],
            [FRAME_MARGIN - 0.01, t],
            [side - FRAME_MARGIN + 0.01, t],
          ]) {
            assert.ok(
              !insideLayout(shape, layout, x, y),
              `${shape} ${size}: (${x}, ${y}) in margin`,
            );
          }
        }
      }
    });

    it(`${shape}: decorative cells lie inside the shape and never in the gap`, () => {
      for (const size of SIZES) {
        const layout = frameLayout(size, shape, 4);
        const cells = decorCells(size, shape, layout, TEXT);
        const top = layout.qrRow - FRAME_GAP;
        const left = layout.qrCol - FRAME_GAP;
        const end = size + FRAME_GAP * 2;
        let dots = 0;
        for (let row = 0; row < layout.side; row += 1) {
          for (let col = 0; col < layout.side; col += 1) {
            if (!cells[row * layout.side + col]) continue;
            dots += 1;
            const inCore = row >= top && row < top + end && col >= left && col < left + end;
            assert.ok(!inCore, `${shape} ${size}: decoration at ${row},${col} inside QR + gap`);
            for (const [dy, dx] of [
              [0, 0],
              [0, 1],
              [1, 0],
              [1, 1],
            ]) {
              assert.ok(insideLayout(shape, layout, col + dx, row + dy), `${shape} ${size}`);
            }
          }
        }
        assert.ok(dots > 0, `${shape} ${size}: no decoration`);
      }
    });
  }

  it("decoration fills a real share of the band around the code", () => {
    for (const shape of FRAMED) {
      const size = 33;
      const layout = frameLayout(size, shape, 4);
      const cells = decorCells(size, shape, layout, TEXT);
      const top = layout.qrRow - FRAME_GAP;
      const left = layout.qrCol - FRAME_GAP;
      const end = size + FRAME_GAP * 2;
      let inside = 0;
      let dots = 0;
      for (let row = 0; row < layout.side; row += 1) {
        for (let col = 0; col < layout.side; col += 1) {
          const inCore = row >= top && row < top + end && col >= left && col < left + end;
          if (inCore || !insideLayout(shape, layout, col + 0.5, row + 0.5)) continue;
          inside += 1;
          dots += cells[row * layout.side + col];
        }
      }
      const share = dots / inside;
      assert.ok(share > 0.4 && share < 0.85, `${shape}: ${share.toFixed(2)} of the band filled`);
    }
  });
});

describe("framed renders", () => {
  for (const shape of FRAMED) {
    it(`${shape}: the gap is plain background and nothing is drawn outside the shape`, () => {
      const frameColor = "#2f5d8a";
      const { symbol, image } = renderText(TEXT, {
        frameShape: shape,
        frameColor,
        dotShape: "rounded",
        modulePx: 4,
      });
      const size = symbol.modules.size;
      const px = image.modulePx;
      const layout = frameLayout(size, shape, 4);
      assert.equal(image.qrRow, layout.qrRow);
      assert.equal(image.qrCol, layout.qrCol);
      assert.equal(image.width, layout.side * px);
      const cells = decorCells(size, shape, layout, TEXT);
      const bg = rgb(INK.background);
      for (let y = 0; y < image.height; y += 1) {
        for (let x = 0; x < image.width; x += 1) {
          const row = Math.floor(y / px);
          const col = Math.floor(x / px);
          const inQr =
            row >= layout.qrRow &&
            row < layout.qrRow + size &&
            col >= layout.qrCol &&
            col < layout.qrCol + size;
          if (inQr || cells[row * layout.side + col]) continue;
          const i = (y * image.width + x) * 4;
          assert.deepEqual(
            [...image.data.subarray(i, i + 3)],
            bg,
            `${shape}: pixel ${x},${y} (module ${row},${col}) is not background`,
          );
        }
      }
    });
  }

  it("decorative dots use the current dot shape and the frame color", () => {
    const frameColor = "#c0392b";
    const looks = new Set<string>();
    for (const dotShape of DOT_SHAPES) {
      const { image } = renderText(TEXT, { frameShape: "circle", frameColor, dotShape });
      // Collect the frame-colored pixels: only decoration uses that color.
      const red = rgb(frameColor);
      let count = 0;
      const sample: number[] = [];
      for (let i = 0; i < image.data.length; i += 4) {
        if (
          image.data[i] === red[0] &&
          image.data[i + 1] === red[1] &&
          image.data[i + 2] === red[2]
        ) {
          count += 1;
          if (sample.length < 4000) sample.push(i);
        }
      }
      assert.ok(count > 0, `${dotShape}: no frame-colored pixels`);
      looks.add(`${count}:${sample.join(",")}`);
    }
    assert.equal(looks.size, DOT_SHAPES.length, "dot shapes draw identical decoration");
  });

  it("caps very large frames at MAX_SIDE_PX by shrinking the module size", () => {
    const { image } = renderText("x".repeat(1200), { frameShape: "star", modulePx: 16, ecc: "L" });
    assert.ok(image.width <= MAX_SIDE_PX, `${image.width}px`);
    assert.ok(image.modulePx < 16 && image.modulePx >= 1);
  });
});

describe("determinism", () => {
  it("the PRNG and hash are stable", () => {
    const random = seededRandom(hashString("QR Zone"));
    const again = seededRandom(hashString("QR Zone"));
    for (let i = 0; i < 100; i += 1) assert.equal(random(), again());
    assert.notEqual(hashString("a"), hashString("b"));
  });

  it("same input gives byte-identical images, without Math.random", () => {
    const original = Math.random;
    Math.random = () => {
      throw new Error("Math.random used in the render path");
    };
    try {
      for (const shape of FRAME_SHAPES) {
        const first = renderText(TEXT, { frameShape: shape, dotShape: "dots" }).image;
        const second = renderText(TEXT, { frameShape: shape, dotShape: "dots" }).image;
        assert.ok(Buffer.from(first.data).equals(Buffer.from(second.data)), shape);
      }
    } finally {
      Math.random = original;
    }
  });

  it("different text gives a different decorative pattern", () => {
    for (const shape of FRAMED) {
      const layout = frameLayout(25, shape, 4);
      const a = decorCells(25, shape, layout, "https://example.com/a");
      const b = decorCells(25, shape, layout, "https://example.com/b");
      assert.ok(!Buffer.from(a).equals(Buffer.from(b)), shape);
    }
  });
});
