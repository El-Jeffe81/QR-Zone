/**
 * Small SVG icons of the frame shapes for the frame picker, made from the
 * same `insideShape` math the renderer uses, so an icon always matches the
 * frame it stands for. Display only: nothing here affects rendering.
 *
 * The first shapes are star-shaped around their center and get a smooth
 * traced outline. The added ones can have separate parts (paw toes, sun
 * rays) or notches (castle, ticket), so they are rasterized onto a fine grid
 * instead, which is still crisp at icon size.
 */

import { insideShape, shapeBounds, type FrameShape } from "./frames.ts";

type Point = [number, number];

/** Shapes drawn as a traced outline; the rest are rasterized. */
export const OUTLINED_SHAPES: readonly FrameShape[] = [
  "circle",
  "rounded",
  "diamond",
  "triangle",
  "hexagon",
  "star",
  "heart",
];

/** Grid cells across the longer side of a rasterized icon. */
export const ICON_GRID = 48;

/**
 * Boundary points of a frame shape, found by marching rays out from the
 * origin and binary-searching where each ray leaves the shape. Only for
 * OUTLINED_SHAPES (star-shaped around the origin); empty otherwise.
 */
export function frameOutline(shape: FrameShape, steps = 360): Point[] {
  if (!OUTLINED_SHAPES.includes(shape)) return [];
  const points: Point[] = [];
  for (let i = 0; i < steps; i += 1) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / steps;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let lo = 0;
    let hi = 2;
    for (let k = 0; k < 24; k += 1) {
      const mid = (lo + hi) / 2;
      if (insideShape(shape, mid * dx, mid * dy)) lo = mid;
      else hi = mid;
    }
    points.push([lo * dx, lo * dy]);
  }
  return points;
}

/**
 * Filled grid cells of a rasterized shape icon, as rectangles
 * [col, row, width, height] in a grid ICON_GRID cells across. A cell is
 * filled when its center is inside the shape; runs are merged along rows,
 * and identical neighboring rows into taller rectangles.
 */
export function frameRaster(shape: FrameShape): [number, number, number, number][] {
  if (shape === "none") return [];
  const [x0, y0, x1, y1] = shapeBounds(shape);
  const size = Math.max(x1 - x0, y1 - y0);
  const cell = size / ICON_GRID;
  const left = (x0 + x1) / 2 - size / 2;
  const top = (y0 + y1) / 2 - size / 2;
  const rows: string[] = [];
  const runsByRow: [number, number][][] = [];
  for (let row = 0; row < ICON_GRID; row += 1) {
    const runs: [number, number][] = [];
    let start = -1;
    for (let col = 0; col <= ICON_GRID; col += 1) {
      const inside =
        col < ICON_GRID && insideShape(shape, left + (col + 0.5) * cell, top + (row + 0.5) * cell);
      if (inside && start < 0) start = col;
      if (!inside && start >= 0) {
        runs.push([start, col - start]);
        start = -1;
      }
    }
    runsByRow.push(runs);
    rows.push(JSON.stringify(runs));
  }
  const rects: [number, number, number, number][] = [];
  for (let row = 0; row < ICON_GRID;) {
    let end = row + 1;
    while (end < ICON_GRID && rows[end] === rows[row]) end += 1;
    for (const [col, width] of runsByRow[row]) rects.push([col, row, width, end - row]);
    row = end;
  }
  return rects;
}

const round = (value: number) => Number(value.toFixed(3));

/** SVG path data and a square viewBox for a frame shape's icon. */
export function frameIcon(shape: FrameShape): { d: string; viewBox: string } | null {
  if (shape === "none") return null;
  if (!OUTLINED_SHAPES.includes(shape)) {
    const d = frameRaster(shape)
      .map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h${-w}Z`)
      .join("");
    return { d, viewBox: `0 0 ${ICON_GRID} ${ICON_GRID}` };
  }
  const points = frameOutline(shape);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const size = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY);
  // Square viewBox centered on the shape, so every icon has the same scale.
  const left = (minX + Math.max(...xs)) / 2 - size / 2;
  const top = (minY + Math.max(...ys)) / 2 - size / 2;
  const d = `${points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${round(x)} ${round(y)}`)
    .join("")}Z`;
  return { d, viewBox: [left, top, size, size].map(round).join(" ") };
}
