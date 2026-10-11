/**
 * Small SVG outlines of the frame shapes for the frame picker, traced from
 * the same `insideShape` math the renderer uses, so an icon always matches
 * the frame it stands for. Display only: nothing here affects rendering.
 */

import { insideShape, type FrameShape } from "./frames.ts";

type Point = [number, number];

/**
 * Boundary points of a frame shape, found by marching rays out from the
 * origin (every frame shape is star-shaped around it) and binary-searching
 * where each ray leaves the shape. Empty for "none".
 */
export function frameOutline(shape: FrameShape, steps = 360): Point[] {
  if (shape === "none") return [];
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

const round = (value: number) => Number(value.toFixed(3));

/** SVG path data and a tight viewBox for a frame shape's outline. */
export function frameIcon(shape: FrameShape): { d: string; viewBox: string } | null {
  const points = frameOutline(shape);
  if (points.length === 0) return null;
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
