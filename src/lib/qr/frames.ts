/**
 * Frame shapes: the outline the decorated QR image is cut to, and the layout
 * that keeps the real (square) QR code plus a clear gap fully inside it.
 *
 * Shapes are defined in normalized coordinates: x and y run roughly from -1
 * to 1, y pointing down. Everything here is pure math, no DOM.
 */

export type FrameShape =
  "none" | "circle" | "rounded" | "diamond" | "triangle" | "hexagon" | "star" | "heart";

export const FRAME_SHAPES: readonly FrameShape[] = [
  "none",
  "circle",
  "rounded",
  "diamond",
  "triangle",
  "hexagon",
  "star",
  "heart",
];

/** Clear modules between the QR symbol and the nearest decorative dot. */
export const FRAME_GAP = 2;
/**
 * Share of the largest square that fits in a shape that the QR + gap takes.
 * Below 1 so every shape keeps a visible band of decorative dots.
 */
const FILL = 0.78;
/** Light modules outside the shape's bounding box, per side. */
export const FRAME_MARGIN = 2;

type Point = [number, number];

function inPolygon(x: number, y: number, points: readonly Point[]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function regularPolygon(sides: number, radius: number, rotation: number): Point[] {
  return Array.from({ length: sides }, (_, i) => {
    const angle = rotation + (i * 2 * Math.PI) / sides;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  });
}

const UP = -Math.PI / 2;
const TRIANGLE: Point[] = [
  [0, -1],
  [1, Math.sqrt(3) - 1],
  [-1, Math.sqrt(3) - 1],
];
const HEXAGON = regularPolygon(6, 1, UP);
/** Five points, inner radius 0.5: plump enough to hold a square code. */
const STAR: Point[] = Array.from({ length: 10 }, (_, i) => {
  const radius = i % 2 === 0 ? 1 : 0.5;
  const angle = UP + (i * Math.PI) / 5;
  // Shift down so the star's bounding box is centered vertically.
  return [radius * Math.cos(angle), radius * Math.sin(angle) + (1 - Math.cos(Math.PI / 5)) / 2];
});
const ROUNDED_RADIUS = 0.4;

/** Whether normalized point (x, y) is inside `shape`. */
export function insideShape(shape: FrameShape, x: number, y: number): boolean {
  switch (shape) {
    case "none":
      return true;
    case "circle":
      return x * x + y * y <= 1;
    case "rounded": {
      if (Math.abs(x) > 1 || Math.abs(y) > 1) return false;
      const r = ROUNDED_RADIUS;
      const cx = Math.min(Math.max(x, -1 + r), 1 - r);
      const cy = Math.min(Math.max(y, -1 + r), 1 - r);
      return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
    }
    case "diamond":
      return Math.abs(x) + Math.abs(y) <= 1;
    case "triangle":
      return inPolygon(x, y, TRIANGLE);
    case "hexagon":
      return inPolygon(x, y, HEXAGON);
    case "star":
      return inPolygon(x, y, STAR);
    case "heart": {
      // (X² + Y² − 1)³ − X²Y³ ≤ 0, y up, scaled to span about -1..1.
      const X = x * 1.14;
      const Y = 0.118 - y * 1.118;
      const a = X * X + Y * Y - 1;
      return a * a * a - X * X * Y * Y * Y <= 0;
    }
  }
}

/** A square, in normalized coordinates, that fits inside a shape. */
export interface FitSquare {
  cx: number;
  cy: number;
  half: number;
}

/** Whether the square is inside the shape, checked on its edges and interior. */
export function squareInside(shape: FrameShape, square: FitSquare, samples = 48) {
  const { cx, cy, half } = square;
  for (let i = 0; i <= samples; i += 1) {
    for (let j = 0; j <= samples; j += 1) {
      const onEdge = i === 0 || j === 0 || i === samples || j === samples;
      // Interior on a coarser lattice; the edges carry the risk.
      if (!onEdge && (i % 4 !== 0 || j % 4 !== 0)) continue;
      const x = cx - half + (2 * half * i) / samples;
      const y = cy - half + (2 * half * j) / samples;
      if (!insideShape(shape, x, y)) return false;
    }
  }
  return true;
}

const fits = new Map<FrameShape, FitSquare>();

/**
 * The largest axis-aligned square (centered on x = 0; every shape is
 * left-right symmetric) that fits in `shape`, found numerically once.
 */
export function largestSquare(shape: FrameShape): FitSquare {
  const cached = fits.get(shape);
  if (cached) return cached;
  let best: FitSquare = { cx: 0, cy: 0, half: 0 };
  for (let step = 0; step <= 120; step += 1) {
    const cy = -0.6 + step * 0.01;
    let lo = 0;
    let hi = 1;
    if (!insideShape(shape, 0, cy)) continue;
    for (let k = 0; k < 24; k += 1) {
      const mid = (lo + hi) / 2;
      if (squareInside(shape, { cx: 0, cy, half: mid }, 24)) lo = mid;
      else hi = mid;
    }
    if (lo > best.half) best = { cx: 0, cy, half: lo };
  }
  fits.set(shape, best);
  return best;
}

/** Where everything goes on the canvas, in module units. */
export interface FrameLayout {
  /** Canvas side, in modules (the canvas is square). */
  side: number;
  /** Top-left module of the QR symbol on the canvas. */
  qrRow: number;
  qrCol: number;
  /** Shape center (canvas module coordinates) and scale (modules per unit). */
  centerX: number;
  centerY: number;
  scale: number;
}

/**
 * Layout for a symbol `size` modules wide. With no frame it is the classic
 * code plus quiet zone. With a frame, the shape is scaled so that the QR plus
 * FRAME_GAP on every side fills FILL of the largest square that fits.
 */
export function frameLayout(size: number, shape: FrameShape, quietModules: number): FrameLayout {
  if (shape === "none") {
    const side = size + quietModules * 2;
    return {
      side,
      qrRow: quietModules,
      qrCol: quietModules,
      centerX: side / 2,
      centerY: side / 2,
      scale: side / 2,
    };
  }
  const fit = largestSquare(shape);
  const core = size + FRAME_GAP * 2;
  const scale = core / 2 / (fit.half * FILL);
  // Smallest integer QR origin that keeps the shape's box inside the margin.
  const half = size / 2;
  const qrCol = Math.ceil(FRAME_MARGIN + scale + fit.cx * scale - half);
  const qrRow = Math.ceil(FRAME_MARGIN + scale + fit.cy * scale - half);
  const extentX = qrCol + half - fit.cx * scale + scale + FRAME_MARGIN;
  const extentY = qrRow + half - fit.cy * scale + scale + FRAME_MARGIN;
  const side = Math.ceil(Math.max(extentX, extentY));
  // Center the shorter axis.
  const shiftX = Math.floor((side - extentX) / 2);
  const shiftY = Math.floor((side - extentY) / 2);
  const col = qrCol + shiftX;
  const row = qrRow + shiftY;
  return {
    side,
    qrRow: row,
    qrCol: col,
    centerX: col + half - fit.cx * scale,
    centerY: row + half - fit.cy * scale,
    scale,
  };
}

/** Whether canvas point (x, y), in modules, is inside the laid-out shape. */
export function insideLayout(shape: FrameShape, layout: FrameLayout, x: number, y: number) {
  return insideShape(
    shape,
    (x - layout.centerX) / layout.scale,
    (y - layout.centerY) / layout.scale,
  );
}

/** 32-bit FNV-1a hash of a string. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic PRNG (mulberry32): same seed, same sequence, in [0, 1). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Share of eligible cells that get a decorative dot. */
const DECOR_DENSITY = 0.5;

/**
 * Decorative cells for a frame, as a `side × side` grid (1 = dot). A cell is
 * eligible only if it lies fully inside the shape and outside the QR + gap.
 * Cells on the shape's edge are always filled so the outline reads clearly;
 * the rest are filled at DECOR_DENSITY by a PRNG seeded from `seed`.
 */
export function decorCells(
  size: number,
  shape: FrameShape,
  layout: FrameLayout,
  seed: string,
): Uint8Array {
  const { side } = layout;
  const cells = new Uint8Array(side * side);
  if (shape === "none") return cells;
  const random = seededRandom(hashString(seed));
  const gapTop = layout.qrRow - FRAME_GAP;
  const gapLeft = layout.qrCol - FRAME_GAP;
  const gapEnd = size + FRAME_GAP * 2;
  const eligible = (row: number, col: number) => {
    if (row < 0 || col < 0 || row >= side || col >= side) return false;
    const inCore =
      row >= gapTop && row < gapTop + gapEnd && col >= gapLeft && col < gapLeft + gapEnd;
    if (inCore) return false;
    for (const [dy, dx] of [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
      [0.5, 0.5],
    ]) {
      if (!insideLayout(shape, layout, col + dx, row + dy)) return false;
    }
    return true;
  };
  const ok = new Uint8Array(side * side);
  for (let row = 0; row < side; row += 1) {
    for (let col = 0; col < side; col += 1) ok[row * side + col] = eligible(row, col) ? 1 : 0;
  }
  const isOk = (row: number, col: number) =>
    row >= 0 && col >= 0 && row < side && col < side && ok[row * side + col] === 1;
  for (let row = 0; row < side; row += 1) {
    for (let col = 0; col < side; col += 1) {
      // Always draw, so the sequence does not depend on the shape mask.
      const roll = random();
      if (!isOk(row, col)) continue;
      const nearCore =
        row >= gapTop - 1 &&
        row <= gapTop + gapEnd &&
        col >= gapLeft - 1 &&
        col <= gapLeft + gapEnd;
      const onEdge =
        !nearCore &&
        (!isOk(row - 1, col) || !isOk(row + 1, col) || !isOk(row, col - 1) || !isOk(row, col + 1));
      cells[row * side + col] = onEdge || roll < DECOR_DENSITY ? 1 : 0;
    }
  }
  return cells;
}
