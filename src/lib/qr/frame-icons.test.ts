import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ICON_GRID, OUTLINED_SHAPES, frameIcon, frameOutline, frameRaster } from "./frame-icons.ts";
import { FRAME_SHAPES, insideShape, shapeBounds } from "./frames.ts";

const RASTERIZED = FRAME_SHAPES.filter((s) => s !== "none" && !OUTLINED_SHAPES.includes(s));

describe("frame picker icons", () => {
  it("None has no icon path (the picker shows a 'no' symbol)", () => {
    assert.deepEqual(frameOutline("none"), []);
    assert.deepEqual(frameRaster("none"), []);
    assert.equal(frameIcon("none"), null);
  });

  it("the first seven shapes are outlined, the thirteen added ones rasterized", () => {
    assert.equal(OUTLINED_SHAPES.length, 7);
    assert.equal(RASTERIZED.length, 13);
  });

  for (const shape of OUTLINED_SHAPES) {
    it(`${shape}: the outline lies on the shape's edge`, () => {
      const points = frameOutline(shape);
      assert.equal(points.length, 360);
      for (const [x, y] of points) {
        assert.ok(insideShape(shape, x * 0.99, y * 0.99), `${shape}: (${x}, ${y}) not on the edge`);
        assert.ok(
          !insideShape(shape, x * 1.01, y * 1.01),
          `${shape}: (${x}, ${y}) not on the edge`,
        );
      }
    });

    it(`${shape}: gives a closed path in a square viewBox`, () => {
      const icon = frameIcon(shape);
      assert.ok(icon);
      assert.match(icon.d, /^M-?[\d.]+ -?[\d.]+(L-?[\d.]+ -?[\d.]+)+Z$/);
      const [, , width, height] = icon.viewBox.split(" ").map(Number);
      assert.equal(width, height);
      assert.ok(width > 1.4 && width <= 2.01, `${shape}: ${width}`);
    });
  }

  for (const shape of RASTERIZED) {
    it(`${shape}: the raster covers exactly the grid cells whose centers are inside`, () => {
      const [x0, y0, x1, y1] = shapeBounds(shape);
      const size = Math.max(x1 - x0, y1 - y0);
      const cell = size / ICON_GRID;
      const left = (x0 + x1) / 2 - size / 2;
      const top = (y0 + y1) / 2 - size / 2;
      const filled = new Uint8Array(ICON_GRID * ICON_GRID);
      for (const [col, row, width, height] of frameRaster(shape)) {
        for (let r = row; r < row + height; r += 1) {
          for (let c = col; c < col + width; c += 1) {
            assert.equal(filled[r * ICON_GRID + c], 0, `${shape}: overlap at ${r},${c}`);
            filled[r * ICON_GRID + c] = 1;
          }
        }
      }
      let count = 0;
      for (let r = 0; r < ICON_GRID; r += 1) {
        for (let c = 0; c < ICON_GRID; c += 1) {
          const inside = insideShape(shape, left + (c + 0.5) * cell, top + (r + 0.5) * cell);
          assert.equal(filled[r * ICON_GRID + c], inside ? 1 : 0, `${shape}: cell ${r},${c}`);
          count += filled[r * ICON_GRID + c];
        }
      }
      assert.ok(count > ICON_GRID * ICON_GRID * 0.2, `${shape}: only ${count} cells`);
      const icon = frameIcon(shape);
      assert.ok(icon);
      assert.equal(icon.viewBox, `0 0 ${ICON_GRID} ${ICON_GRID}`);
      assert.match(icon.d, /^(M\d+ \d+h\d+v\d+h-\d+Z)+$/);
    });
  }

  it("each shape has a distinct icon", () => {
    const paths = FRAME_SHAPES.filter((s) => s !== "none").map((s) => frameIcon(s)?.d);
    assert.equal(new Set(paths).size, paths.length);
  });
});
