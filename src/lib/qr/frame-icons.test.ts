import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { frameIcon, frameOutline } from "./frame-icons.ts";
import { FRAME_SHAPES, insideShape } from "./frames.ts";

describe("frame picker icons", () => {
  it("None has no outline", () => {
    assert.deepEqual(frameOutline("none"), []);
    assert.equal(frameIcon("none"), null);
  });

  for (const shape of FRAME_SHAPES.filter((s) => s !== "none")) {
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

  it("each shape has a distinct icon", () => {
    const paths = FRAME_SHAPES.filter((s) => s !== "none").map((s) => frameIcon(s)?.d);
    assert.equal(new Set(paths).size, paths.length);
  });
});
