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
  shapeBounds,
  solidPart,
  type FrameLayout,
} from "./frames.ts";
import { DOT_SHAPES, MAX_SIDE_PX } from "./render.ts";
import { INK, renderText } from "./test-support.ts";

const FRAMED = FRAME_SHAPES.filter((shape) => shape !== "none");
/** The first set keeps square canvases (their images must not change). */
const FIRST_SET = ["circle", "rounded", "diamond", "triangle", "hexagon", "star", "heart"];
/** Symbol sizes from version 1 (21 modules) to version 40 (177 modules). */
const SIZES = [21, 25, 33, 57, 101, 177];
const TEXT = "https://el-jeffe81.github.io/QR-Zone/";
const FRAME_COLOR = "#2f5d8a";

function rgb(hex: string) {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
}

/** The code plus its gap, in canvas modules: [top, left, side]. */
function core(layout: FrameLayout, size: number) {
  return [layout.qrRow - FRAME_GAP, layout.qrCol - FRAME_GAP, size + FRAME_GAP * 2] as const;
}

describe("frame layout geometry", () => {
  it("lists None first, then the first seven shapes, then the thirteen added ones", () => {
    assert.deepEqual(FRAME_SHAPES, [
      "none",
      "circle",
      "rounded",
      "diamond",
      "triangle",
      "hexagon",
      "star",
      "heart",
      "castle",
      "cloud",
      "rectangle",
      "octagon",
      "house",
      "sun",
      "moon",
      "shield",
      "speech-bubble",
      "map-pin",
      "gear",
      "paw-print",
      "ticket",
    ]);
  });

  it("None is the classic code plus quiet zone", () => {
    for (const size of SIZES) {
      const layout = frameLayout(size, "none", 4);
      assert.equal(layout.cols, size + 8);
      assert.equal(layout.rows, size + 8);
      assert.equal(layout.qrRow, 4);
      assert.equal(layout.qrCol, 4);
    }
  });

  it("the first shapes keep square canvases; wide added shapes get wide ones", () => {
    for (const shape of FIRST_SET) {
      const layout = frameLayout(33, shape as (typeof FRAMED)[number], 4);
      assert.equal(layout.cols, layout.rows, shape);
    }
    for (const shape of ["rectangle", "ticket", "cloud"] as const) {
      const layout = frameLayout(33, shape, 4);
      assert.ok(layout.cols > layout.rows * 1.2, `${shape}: ${layout.cols}×${layout.rows}`);
    }
    assert.ok(frameLayout(33, "map-pin", 4).rows > frameLayout(33, "map-pin", 4).cols);
  });

  for (const shape of FRAMED) {
    it(`${shape}: the QR plus its ${FRAME_GAP}-module gap sits fully inside the shape`, () => {
      for (const size of SIZES) {
        const layout = frameLayout(size, shape, 4);
        const [top, left, end] = core(layout, size);
        // Walk the outline of the QR + gap square every quarter module, and
        // its inside on a module lattice.
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
        for (let y = top; y <= top + end; y += 1) {
          for (let x = left; x <= left + end; x += 1) {
            assert.ok(insideLayout(shape, layout, x, y), `${shape} ${size}: (${x}, ${y}) outside`);
          }
        }
      }
    });

    it(`${shape}: the whole shape stays on the canvas with a ${FRAME_MARGIN}-module margin`, () => {
      for (const size of SIZES) {
        const layout = frameLayout(size, shape, 4);
        const { cols, rows } = layout;
        const near = 0.01;
        for (let t = 0; t <= Math.max(cols, rows); t += 0.5) {
          for (const [x, y] of [
            [t, FRAME_MARGIN - near],
            [t, rows - FRAME_MARGIN + near],
            [FRAME_MARGIN - near, t],
            [cols - FRAME_MARGIN + near, t],
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
        assert.equal(cells.length, layout.cols * layout.rows);
        const [top, left, end] = core(layout, size);
        let dots = 0;
        for (let row = 0; row < layout.rows; row += 1) {
          for (let col = 0; col < layout.cols; col += 1) {
            if (!cells[row * layout.cols + col]) continue;
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
      const [top, left, end] = core(layout, size);
      let inside = 0;
      let dots = 0;
      for (let row = 0; row < layout.rows; row += 1) {
        for (let col = 0; col < layout.cols; col += 1) {
          const inCore = row >= top && row < top + end && col >= left && col < left + end;
          if (inCore || !insideLayout(shape, layout, col + 0.5, row + 0.5)) continue;
          inside += 1;
          dots += cells[row * layout.cols + col];
        }
      }
      const share = dots / inside;
      assert.ok(share > 0.4 && share < 0.9, `${shape}: ${share.toFixed(2)} of the band filled`);
    }
  });

  it("sun rays are drawn fully, not as a dot pattern", () => {
    const size = 33;
    const layout = frameLayout(size, "sun", 4);
    const cells = decorCells(size, "sun", layout, TEXT);
    let rayCells = 0;
    for (let row = 0; row < layout.rows; row += 1) {
      for (let col = 0; col < layout.cols; col += 1) {
        const x = (col + 0.5 - layout.centerX) / layout.scale;
        const y = (row + 0.5 - layout.centerY) / layout.scale;
        const fullyIn = [0, 1].every((dy) =>
          [0, 1].every((dx) => insideLayout("sun", layout, col + dx, row + dy)),
        );
        if (!solidPart("sun", x, y) || !fullyIn) continue;
        rayCells += 1;
        assert.equal(cells[row * layout.cols + col], 1, `ray cell ${row},${col} empty`);
      }
    }
    assert.ok(rayCells > 50, `${rayCells} ray cells`);
  });

  it("every shape's bounds hold the shape", () => {
    for (const shape of FRAMED) {
      const [x0, y0, x1, y1] = shapeBounds(shape);
      assert.ok(Math.max(x1 - x0, y1 - y0) <= 2.0001, shape);
      // Nothing of the shape outside its bounds.
      for (let t = 0; t <= 1; t += 0.01) {
        for (const [x, y] of [
          [x0 - 0.01, y0 + (y1 - y0) * t],
          [x1 + 0.01, y0 + (y1 - y0) * t],
          [x0 + (x1 - x0) * t, y0 - 0.01],
          [x0 + (x1 - x0) * t, y1 + 0.01],
        ]) {
          const layout = { centerX: 0, centerY: 0, scale: 1 } as FrameLayout;
          assert.ok(!insideLayout(shape, layout, x, y), `${shape}: (${x}, ${y})`);
        }
      }
    }
  });
});

describe("framed renders", () => {
  for (const shape of FRAMED) {
    it(`${shape}: the gap is plain background and nothing is drawn outside the shape`, () => {
      const { symbol, image } = renderText(TEXT, {
        frameShape: shape,
        frameColor: FRAME_COLOR,
        dotShape: "rounded",
        modulePx: 4,
      });
      const size = symbol.modules.size;
      const px = image.modulePx;
      const layout = frameLayout(size, shape, 4);
      assert.equal(image.qrRow, layout.qrRow);
      assert.equal(image.qrCol, layout.qrCol);
      assert.equal(image.width, layout.cols * px);
      assert.equal(image.height, layout.rows * px);
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
          if (inQr || cells[row * layout.cols + col]) continue;
          const i = (y * image.width + x) * 4;
          assert.deepEqual(
            [...image.data.subarray(i, i + 3)],
            bg,
            `${shape}: pixel ${x},${y} (module ${row},${col}) is not background`,
          );
        }
      }
    });

    it(`${shape}: solid fill paints the shape, keeps a clean window, and leaves the code alone`, () => {
      const options = {
        frameShape: shape,
        frameColor: FRAME_COLOR,
        dotShape: "dots",
        modulePx: 4,
      } as const;
      const dots = renderText(TEXT, { ...options, frameFill: "dots" } as const).image;
      const { symbol, image } = renderText(TEXT, { ...options, frameFill: "solid" } as const);
      const size = symbol.modules.size;
      const px = image.modulePx;
      const layout = frameLayout(size, shape, 4);
      assert.equal(image.width, dots.width);
      assert.equal(image.height, dots.height);
      const [top, left, end] = core(layout, size);
      const bg = rgb(INK.background);
      const frame = rgb(FRAME_COLOR);
      let painted = 0;
      for (let row = 0; row < layout.rows; row += 1) {
        for (let col = 0; col < layout.cols; col += 1) {
          const inWindow = row >= top && row < top + end && col >= left && col < left + end;
          const inQr =
            row >= layout.qrRow &&
            row < layout.qrRow + size &&
            col >= layout.qrCol &&
            col < layout.qrCol + size;
          // A 9×9 lattice per module (finer than the renderer's own check).
          let hits = 0;
          for (let j = 0; j <= 8; j += 1) {
            for (let i = 0; i <= 8; i += 1) {
              if (insideLayout(shape, layout, col + i / 8, row + j / 8)) hits += 1;
            }
          }
          // Expected color of the whole module, or null where it may be mixed.
          let expected: number[] | null = null;
          if (inWindow && !inQr) expected = bg;
          else if (!inWindow && hits === 81) expected = frame;
          for (let y = row * px; y < (row + 1) * px; y += 1) {
            for (let x = col * px; x < (col + 1) * px; x += 1) {
              const i = (y * image.width + x) * 4;
              const actual = [...image.data.subarray(i, i + 3)];
              if (inQr) {
                assert.deepEqual(actual, [...dots.data.subarray(i, i + 3)], `${shape}: code pixel`);
              } else if (expected) {
                assert.deepEqual(actual, expected, `${shape}: module ${row},${col}`);
              } else if (hits === 0 && !inWindow) {
                // Well outside: only anti-aliasing from a neighbor's edge.
                const lighter = actual.every((v, c) => v >= Math.min(bg[c], frame[c]) - 1);
                assert.ok(lighter, `${shape}: module ${row},${col}`);
              }
            }
          }
          if (expected === frame) painted += 1;
        }
      }
      assert.ok(painted > 0, `${shape}: nothing painted`);
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
    for (const frameShape of ["star", "sun", "ticket"] as const) {
      const { image } = renderText("x".repeat(1200), { frameShape, modulePx: 16, ecc: "L" });
      assert.ok(Math.max(image.width, image.height) <= MAX_SIDE_PX, `${frameShape}`);
      assert.ok(image.modulePx < 16 && image.modulePx >= 1);
    }
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
        for (const frameFill of ["dots", "solid"] as const) {
          const options = { frameShape: shape, frameFill, dotShape: "dots" } as const;
          const first = renderText(TEXT, options).image;
          const second = renderText(TEXT, options).image;
          assert.ok(Buffer.from(first.data).equals(Buffer.from(second.data)), shape);
        }
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

  it("a solid frame does not depend on the seed", () => {
    for (const shape of FRAMED) {
      const one = renderText(TEXT, { frameShape: shape, frameFill: "solid", seed: "a" }).image;
      const two = renderText(TEXT, { frameShape: shape, frameFill: "solid", seed: "b" }).image;
      assert.ok(Buffer.from(one.data).equals(Buffer.from(two.data)), shape);
    }
  });
});
