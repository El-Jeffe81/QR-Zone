/**
 * Frame shapes: the outline the decorated QR image is cut to, and the layout
 * that keeps the real (square) QR code plus a clear gap fully inside it.
 *
 * Shapes are defined in normalized coordinates: x and y run roughly from -1
 * to 1, y pointing down. Everything here is pure math, no DOM.
 */

export type FrameShape =
  | "none"
  | "circle"
  | "rounded"
  | "diamond"
  | "triangle"
  | "hexagon"
  | "star"
  | "heart"
  | "castle"
  | "cloud"
  | "rectangle"
  | "octagon"
  | "house"
  | "sun"
  | "moon"
  | "shield"
  | "speech-bubble"
  | "map-pin"
  | "gear"
  | "paw-print"
  | "ticket";

export const FRAME_SHAPES: readonly FrameShape[] = [
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

/**
 * Shapes added after the first set. Each is drawn in its own "design" pixel
 * grid (y down), the way it was sketched, and mapped to normalized
 * coordinates around the center of its bounding box, with the longer side
 * spanning -1..1. `pref` is where the code should sit when several equally
 * large spots fit (the main body: the castle keep, the paw pad, ...).
 */
interface ShapeDef {
  /** Bounding box in design pixels: [left, top, right, bottom]. */
  box: readonly [number, number, number, number];
  pref: Point;
  inside: (X: number, Y: number) => boolean;
  /** Parts drawn fully, without the dot pattern (thin details like sun rays). */
  solid?: (X: number, Y: number) => boolean;
}

const rect = (X: number, Y: number, x0: number, y0: number, x1: number, y1: number) =>
  X >= x0 && X <= x1 && Y >= y0 && Y <= y1;

function roundRect(
  X: number,
  Y: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
) {
  if (!rect(X, Y, x0, y0, x1, y1)) return false;
  const cx = Math.min(Math.max(X, x0 + r), x1 - r);
  const cy = Math.min(Math.max(Y, y0 + r), y1 - r);
  return (X - cx) ** 2 + (Y - cy) ** 2 <= r * r;
}

const disc = (X: number, Y: number, cx: number, cy: number, r: number) =>
  (X - cx) ** 2 + (Y - cy) ** 2 <= r * r;

/** A bar along direction `angle` from the center (cx, cy), tapering outward. */
function ray(
  X: number,
  Y: number,
  cx: number,
  cy: number,
  angle: number,
  from: number,
  to: number,
  halfStart: number,
  halfEnd: number,
) {
  const dx = X - cx;
  const dy = Y - cy;
  const along = dx * Math.cos(angle) + dy * Math.sin(angle);
  if (along < from || along > to) return false;
  const across = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
  const t = (along - from) / (to - from);
  return across <= halfStart + (halfEnd - halfStart) * t;
}

const SUN_RAYS = 8;
const sunRay = (X: number, Y: number) => {
  for (let k = 0; k < SUN_RAYS; k += 1) {
    if (ray(X, Y, 46, 46, (2 * Math.PI * k) / SUN_RAYS, 34, 46, 6.5, 3)) return true;
  }
  return false;
};

/** Tangent points from the map pin's tip to its round head. */
const PIN = (() => {
  const c = 32;
  const r = 31.5;
  const tip: Point = [32, 85.5];
  const d = tip[1] - c;
  const angle = Math.asin(r / d);
  const left: Point = [c - r * Math.cos(angle), c + r * Math.sin(angle)];
  const right: Point = [c + r * Math.cos(angle), c + r * Math.sin(angle)];
  return [left, right, tip] as const;
})();

const PAW_TOES: readonly [number, number, number, number, number][] = [
  [11, 34, 8, 10.5, -0.5],
  [32, 15, 9, 11.5, -0.15],
  [58, 15, 9, 11.5, 0.15],
  [79, 34, 8, 10.5, 0.5],
];

/** Where the ticket tears: a cleared strip across it, notched at both edges. */
const TICKET_TEAR = 60;

const SHAPES: Partial<Record<FrameShape, ShapeDef>> = {
  castle: {
    box: [0, 2, 72, 70],
    pref: [36, 46],
    inside: (X, Y) => {
      let inside = rect(X, Y, 11, 20, 61, 70);
      for (let x0 = 11; x0 < 61; x0 += 10) inside ||= rect(X, Y, x0 + 2.5, 13, x0 + 7.5, 20);
      for (const tx of [0, 54]) {
        inside ||= rect(X, Y, tx, 9, tx + 18, 70);
        for (let k = 0; k < 3; k += 1) inside ||= rect(X, Y, tx + k * 7, 2, tx + k * 7 + 4, 9);
      }
      if (!inside) return false;
      // Arched gates at the foot of both towers.
      for (const tx of [0, 54]) {
        if (rect(X, Y, tx + 6, 61, tx + 12, 70) || disc(X, Y, tx + 9, 61, 3)) return false;
      }
      return true;
    },
  },
  cloud: {
    box: [-3, 0, 87, 62],
    pref: [44, 41],
    inside: (X, Y) =>
      roundRect(X, Y, 6, 22, 80, 62, 12) ||
      disc(X, Y, 28, 24, 15) ||
      disc(X, Y, 48, 18, 18) ||
      disc(X, Y, 66, 28, 13) ||
      disc(X, Y, 12, 42, 11) ||
      disc(X, Y, 76, 44, 10),
  },
  rectangle: {
    box: [0, 0, 66, 45],
    pref: [33, 22.5],
    inside: (X, Y) => rect(X, Y, 0, 0, 66, 45),
  },
  octagon: {
    box: [0, 0, 56, 56],
    pref: [28, 28],
    inside: (X, Y) => {
      const dx = Math.abs(X - 28);
      const dy = Math.abs(Y - 28);
      return dx <= 28 && dy <= 28 && dx + dy <= 28 * Math.SQRT2;
    },
  },
  house: {
    box: [-1, 0, 71, 72],
    pref: [35, 48],
    inside: (X, Y) =>
      inPolygon(X, Y, [
        [35, 0],
        [71, 27],
        [-1, 27],
      ]) ||
      rect(X, Y, 49, 4, 56, 22) ||
      rect(X, Y, 8, 26, 62, 72),
  },
  sun: {
    box: [0, 0, 92, 92],
    pref: [46, 46],
    inside: (X, Y) => disc(X, Y, 46, 46, 28.5) || sunRay(X, Y),
    solid: sunRay,
  },
  moon: {
    box: [1, 1, 91, 91],
    pref: [30, 58],
    // A fat crescent; the large bite circle keeps the inner curve smooth.
    inside: (X, Y) => disc(X, Y, 46, 46, 45) && !disc(X, Y, 78, 20, 40),
  },
  shield: {
    box: [0, 0, 58, 72],
    pref: [29, 26],
    inside: (X, Y) => {
      const half = 29;
      const t = Math.min(Math.max((Y - 34) / 38, 0), 1);
      const width = half * Math.cos((Math.PI / 2) * t) ** 0.75;
      const top = 4.5 - 4.5 * ((X - half) / half) ** 2;
      return Y >= Math.max(top, 0) && Math.abs(X - half) <= width && Y <= 72;
    },
  },
  "speech-bubble": {
    box: [0, 0, 64, 59],
    pref: [32, 23],
    inside: (X, Y) =>
      roundRect(X, Y, 0, 0, 64, 46, 11) ||
      inPolygon(X, Y, [
        [12, 40],
        [28, 40],
        [6, 59],
      ]),
  },
  "map-pin": {
    box: [0.5, 0.5, 63.5, 85.5],
    pref: [32, 32],
    inside: (X, Y) => disc(X, Y, 32, 32, 31.5) || inPolygon(X, Y, PIN),
  },
  gear: {
    box: [1.5, 1.5, 78.5, 78.5],
    pref: [40, 40],
    inside: (X, Y) => {
      if (disc(X, Y, 40, 40, 30)) return true;
      for (let k = 0; k < 10; k += 1) {
        if (ray(X, Y, 40, 40, (2 * Math.PI * k) / 10, 26, 38.5, 5.2, 4)) return true;
      }
      return false;
    },
  },
  "paw-print": {
    box: [2, 3, 88, 88],
    pref: [45, 64],
    inside: (X, Y) => {
      // Main pad: a rounded square-ish superellipse.
      if (Math.abs((X - 45) / 25) ** 3.2 + Math.abs((Y - 63) / 24) ** 3.2 <= 1) return true;
      return PAW_TOES.some(([cx, cy, rx, ry, rot]) => {
        const u = (X - cx) * Math.cos(rot) + (Y - cy) * Math.sin(rot);
        const v = -(X - cx) * Math.sin(rot) + (Y - cy) * Math.cos(rot);
        return (u / rx) ** 2 + (v / ry) ** 2 <= 1;
      });
    },
  },
  ticket: {
    box: [0, 0, 80, 45],
    pref: [31.5, 22.5],
    inside: (X, Y) => {
      if (!roundRect(X, Y, 0, 0, 80, 45, 3)) return false;
      if (Math.abs(X - TICKET_TEAR) < 1.8) return false;
      return !(
        disc(X, Y, TICKET_TEAR, 0, 5) ||
        disc(X, Y, TICKET_TEAR, 45, 5) ||
        disc(X, Y, 0, 22.5, 4.5) ||
        disc(X, Y, 80, 22.5, 4.5)
      );
    },
  },
};

/** Design-pixel center and units per normalized unit for an added shape. */
function designFrame(def: ShapeDef) {
  const [x0, y0, x1, y1] = def.box;
  return {
    mx: (x0 + x1) / 2,
    my: (y0 + y1) / 2,
    unit: Math.max(x1 - x0, y1 - y0) / 2,
  };
}

function toDesign(def: ShapeDef, x: number, y: number): Point {
  const { mx, my, unit } = designFrame(def);
  return [mx + x * unit, my + y * unit];
}

/** Normalized bounding box of a shape: [left, top, right, bottom]. */
export function shapeBounds(shape: FrameShape): [number, number, number, number] {
  const def = SHAPES[shape];
  if (!def) return [-1, -1, 1, 1];
  const { mx, my, unit } = designFrame(def);
  const [x0, y0, x1, y1] = def.box;
  return [(x0 - mx) / unit, (y0 - my) / unit, (x1 - mx) / unit, (y1 - my) / unit];
}

/** Whether normalized point (x, y) is in a part of `shape` drawn fully. */
export function solidPart(shape: FrameShape, x: number, y: number): boolean {
  const def = SHAPES[shape];
  if (!def?.solid) return false;
  const [X, Y] = toDesign(def, x, y);
  return def.solid(X, Y);
}

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
    default: {
      const def = SHAPES[shape];
      if (!def) return false;
      const [X, Y] = toDesign(def, x, y);
      return def.inside(X, Y);
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
  const def = SHAPES[shape];
  if (def) {
    const fit = largestSquareAnywhere(shape, def);
    fits.set(shape, fit);
    return fit;
  }
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

/** Largest square half-side centered at (cx, cy), or 0 if `atLeast` does not fit. */
function growSquare(shape: FrameShape, cx: number, cy: number, atLeast: number, samples: number) {
  if (!squareInside(shape, { cx, cy, half: atLeast }, samples)) return 0;
  let lo = atLeast;
  let hi = 1.5;
  for (let k = 0; k < 20; k += 1) {
    const mid = (lo + hi) / 2;
    if (squareInside(shape, { cx, cy, half: mid }, samples)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Largest axis-aligned square anywhere in an added shape (these need not be
 * symmetric, and the code may sit off-center: moon, paw pad, speech bubble).
 * A coarse grid finds the region, a fine grid around it the spot. Among
 * near-equal spots (a rectangle has a whole row of them) the one nearest the
 * shape's preferred center wins.
 */
function largestSquareAnywhere(shape: FrameShape, def: ShapeDef): FitSquare {
  const [x0, y0, x1, y1] = shapeBounds(shape);
  const { mx, my, unit } = designFrame(def);
  const prefX = (def.pref[0] - mx) / unit;
  const prefY = (def.pref[1] - my) / unit;
  const search = (cxs: number[], cys: number[], samples: number): FitSquare => {
    const found: FitSquare[] = [];
    let top = 0;
    for (const cy of cys) {
      for (const cx of cxs) {
        if (!insideShape(shape, cx, cy)) continue;
        const half = growSquare(shape, cx, cy, top * 0.97, samples);
        if (half <= 0) continue;
        top = Math.max(top, half);
        found.push({ cx, cy, half });
      }
    }
    const near = found.filter((fit) => fit.half >= top * 0.985);
    const distance = (fit: FitSquare) => (fit.cx - prefX) ** 2 + (fit.cy - prefY) ** 2;
    near.sort((a, b) => distance(a) - distance(b) || b.half - a.half);
    return near[0] ?? { cx: 0, cy: 0, half: 0 };
  };
  const steps = (from: number, to: number, step: number) => {
    const out: number[] = [];
    for (let v = from; v <= to + 1e-9; v += step) out.push(Number(v.toFixed(4)));
    return out;
  };
  const coarse = search(steps(x0, x1, 0.04), steps(y0, y1, 0.04), 24);
  const fine = search(
    steps(coarse.cx - 0.04, coarse.cx + 0.04, 0.005),
    steps(coarse.cy - 0.04, coarse.cy + 0.04, 0.005),
    48,
  );
  return fine.half >= coarse.half * 0.98 ? fine : coarse;
}

/** Where everything goes on the canvas, in module units. */
export interface FrameLayout {
  /** Canvas width and height, in modules. */
  cols: number;
  rows: number;
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
      cols: side,
      rows: side,
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
  if (SHAPES[shape]) return addedShapeLayout(size, shape, fit, scale);
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
    cols: side,
    rows: side,
    qrRow: row,
    qrCol: col,
    centerX: col + half - fit.cx * scale,
    centerY: row + half - fit.cy * scale,
    scale,
  };
}

/**
 * Layout for the added shapes: the canvas is cut to the shape's own bounding
 * box (plus FRAME_MARGIN), so wide shapes like the ticket get wide images.
 * (The first shapes keep their square canvas, so their images never change.)
 */
function addedShapeLayout(
  size: number,
  shape: FrameShape,
  fit: FitSquare,
  scale: number,
): FrameLayout {
  const [x0, y0, x1, y1] = shapeBounds(shape);
  const half = size / 2;
  const qrCol = Math.ceil(FRAME_MARGIN - x0 * scale + fit.cx * scale - half);
  const qrRow = Math.ceil(FRAME_MARGIN - y0 * scale + fit.cy * scale - half);
  const centerX = qrCol + half - fit.cx * scale;
  const centerY = qrRow + half - fit.cy * scale;
  return {
    cols: Math.ceil(centerX + x1 * scale + FRAME_MARGIN),
    rows: Math.ceil(centerY + y1 * scale + FRAME_MARGIN),
    qrRow,
    qrCol,
    centerX,
    centerY,
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
  const { cols, rows } = layout;
  const cells = new Uint8Array(cols * rows);
  if (shape === "none") return cells;
  const random = seededRandom(hashString(seed));
  const gapTop = layout.qrRow - FRAME_GAP;
  const gapLeft = layout.qrCol - FRAME_GAP;
  const gapEnd = size + FRAME_GAP * 2;
  const eligible = (row: number, col: number) => {
    if (row < 0 || col < 0 || row >= rows || col >= cols) return false;
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
  const ok = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) ok[row * cols + col] = eligible(row, col) ? 1 : 0;
  }
  const isOk = (row: number, col: number) =>
    row >= 0 && col >= 0 && row < rows && col < cols && ok[row * cols + col] === 1;
  const isSolid = (row: number, col: number) =>
    solidPart(
      shape,
      (col + 0.5 - layout.centerX) / layout.scale,
      (row + 0.5 - layout.centerY) / layout.scale,
    );
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
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
      cells[row * cols + col] = onEdge || roll < DECOR_DENSITY || isSolid(row, col) ? 1 : 0;
    }
  }
  return cells;
}
