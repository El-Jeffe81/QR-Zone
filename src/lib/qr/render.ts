/**
 * Pure QR raster renderer: turns a QR module matrix into RGBA pixels.
 *
 * Both the canvas preview (and therefore the downloaded PNG) and the decode
 * tests use this one function, so what the tests scan is exactly what the
 * user sees. No DOM or canvas APIs here.
 */

import {
  FRAME_GAP,
  decorCells,
  frameLayout,
  insideLayout,
  type FrameLayout,
  type FrameShape,
} from "./frames.ts";

export type DotShape = "square" | "rounded" | "dots";
export type CornerStyle = "square" | "rounded" | "circle";

export const DOT_SHAPES: readonly DotShape[] = ["square", "rounded", "dots"];

/** How the frame is filled: a dot pattern (default) or one solid color. */
export type FrameFill = "dots" | "solid";
export const FRAME_FILLS: readonly FrameFill[] = ["dots", "solid"];
export const CORNER_STYLES: readonly CornerStyle[] = ["square", "rounded", "circle"];

/** The part of a `qrcode` symbol the renderer needs. */
export interface ModuleMatrix {
  size: number;
  get(row: number, col: number): number | boolean;
  /**
   * True for function-pattern modules (finder, timing, alignment, format and
   * version info). Those stay square so scanners can still lock on to them.
   */
  isReserved?(row: number, col: number): number | boolean;
}

export interface RenderOptions {
  /** Pixels per module. */
  modulePx: number;
  /** Light modules around the symbol (the quiet zone), per side. */
  quietModules: number;
  foreground: string;
  background: string;
  dotShape: DotShape;
  cornerStyle: CornerStyle;
  /** Outline the image is cut to; "none" (default) is the plain square code. */
  frameShape?: FrameShape;
  /** #rrggbb for the decorative dots; defaults to `foreground`. */
  frameColor?: string;
  /**
   * "dots" (default) fills the frame with a seeded dot pattern; "solid"
   * fills the whole shape with `frameColor`, leaving a clean window of the
   * code plus FRAME_GAP modules around it.
   */
  frameFill?: FrameFill;
  /**
   * Seeds the decorative dot pattern, so the same text and settings always
   * give the same image. Callers pass the text plus their settings.
   */
  seed?: string;
}

export interface RenderedQr {
  width: number;
  height: number;
  /** Pixels per module actually used (large frames are capped, see MAX_SIDE_PX). */
  modulePx: number;
  /** Top-left module of the QR symbol on the canvas (equals quietModules without a frame). */
  qrRow: number;
  qrCol: number;
  /** RGBA, row-major, `width * height * 4` bytes. */
  data: Uint8ClampedArray<ArrayBuffer>;
}

/** Finder patterns are 7×7 modules in three corners of every symbol. */
const FINDER = 7;
/** Dot radius in module units; just under half so neighbors stay distinct. */
const DOT_RADIUS = 0.45;
/** Sub-samples per pixel axis on curved edges (anti-aliasing). */
const SUPERSAMPLE = 4;
/**
 * Largest image side, in pixels. Big frames around long texts would otherwise
 * reach canvas limits, so the module size is reduced to fit.
 */
export const MAX_SIDE_PX = 4096;

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const value = /^#([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (!value) throw new Error(`Not a #rrggbb color: ${hex}`);
  return [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16)) as Rgb;
}

/** Top-left module of each finder pattern, as [row, col]. */
export function finderOrigins(size: number): [number, number][] {
  return [
    [0, 0],
    [0, size - FINDER],
    [size - FINDER, 0],
  ];
}

function inFinder(size: number, row: number, col: number) {
  return finderOrigins(size).some(
    ([r, c]) => row >= r && row < r + FINDER && col >= c && col < c + FINDER,
  );
}

/** Point-in-rounded-rectangle; `radius` is clamped to half the side. */
function inRoundedSquare(x: number, y: number, x0: number, side: number, radius: number) {
  const x1 = x0 + side;
  if (x < x0 || x > x1 || y < x0 || y > x1) return false;
  const r = Math.min(radius, side / 2);
  if (r <= 0) return true;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, x0 + r), x1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/**
 * Whether a point inside a finder pattern is dark. `x`, `y` are in module
 * units relative to the pattern's top-left, 0..7.
 */
function finderDark(x: number, y: number, style: CornerStyle) {
  // Corner radius per ring as a share of that ring's side.
  const share = style === "circle" ? 0.5 : style === "rounded" ? 0.3 : 0;
  const outer = inRoundedSquare(x, y, 0, 7, 7 * share);
  const hole = inRoundedSquare(x, y, 1, 5, 5 * share);
  const eye = inRoundedSquare(x, y, 2, 3, 3 * share);
  return (outer && !hole) || eye;
}

/**
 * Whether a point inside a dark data module is dark. `u`, `v` are 0..1 within
 * the module; `dark(dr, dc)` reports a neighbor relative to this module.
 */
function moduleDark(
  u: number,
  v: number,
  shape: DotShape,
  dark: (dr: number, dc: number) => boolean,
) {
  if (shape === "square") return true;
  const du = u - 0.5;
  const dv = v - 0.5;
  if (shape === "dots") return du * du + dv * dv <= DOT_RADIUS * DOT_RADIUS;
  // Rounded: round a corner only when both modules touching that corner's
  // edges are light, so runs of dark modules stay joined as smooth blobs.
  const sc = du < 0 ? -1 : 1;
  const sr = dv < 0 ? -1 : 1;
  if (dark(0, sc) || dark(sr, 0)) return true;
  return du * du + dv * dv <= 0.25;
}

/**
 * Coverage (0..1) of each pixel of a `modulePx`-square tile for which
 * `inside(u, v)` holds, with `u`, `v` in tile units (0..units).
 */
function coverageTile(
  modulePx: number,
  units: number,
  inside: (u: number, v: number) => boolean,
): Float32Array {
  const side = modulePx * units;
  const tile = new Float32Array(side * side);
  const step = 1 / SUPERSAMPLE;
  for (let py = 0; py < side; py += 1) {
    for (let px = 0; px < side; px += 1) {
      let hits = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const u = (px + (sx + 0.5) * step) / modulePx;
          const v = (py + (sy + 0.5) * step) / modulePx;
          if (inside(u, v)) hits += 1;
        }
      }
      tile[py * side + px] = hits / (SUPERSAMPLE * SUPERSAMPLE);
    }
  }
  return tile;
}

/** Points per module axis used to classify a module as fully in or out. */
const CLASSIFY = 5;

/**
 * Coverage tiles for a solid frame: every module of the canvas outside the
 * code's window (code plus FRAME_GAP), as [row, col, tile]. Modules fully
 * inside the shape are solid; modules on its edge are anti-aliased.
 */
function solidFrameTiles(
  size: number,
  shape: FrameShape,
  layout: FrameLayout,
  modulePx: number,
): [number, number, Float32Array][] {
  const out: [number, number, Float32Array][] = [];
  const full = new Float32Array(modulePx * modulePx).fill(1);
  const top = layout.qrRow - FRAME_GAP;
  const left = layout.qrCol - FRAME_GAP;
  const end = size + FRAME_GAP * 2;
  for (let row = 0; row < layout.rows; row += 1) {
    for (let col = 0; col < layout.cols; col += 1) {
      if (row >= top && row < top + end && col >= left && col < left + end) continue;
      let hits = 0;
      for (let j = 0; j < CLASSIFY; j += 1) {
        for (let i = 0; i < CLASSIFY; i += 1) {
          const x = col + i / (CLASSIFY - 1);
          const y = row + j / (CLASSIFY - 1);
          if (insideLayout(shape, layout, x, y)) hits += 1;
        }
      }
      if (hits === 0) continue;
      if (hits === CLASSIFY * CLASSIFY) {
        out.push([row, col, full]);
        continue;
      }
      out.push([
        row,
        col,
        coverageTile(modulePx, 1, (u, v) => insideLayout(shape, layout, col + u, row + v)),
      ]);
    }
  }
  return out;
}

/** Render `matrix` to RGBA pixels with the chosen shapes, colors and frame. */
export function renderQr(matrix: ModuleMatrix, options: RenderOptions): RenderedQr {
  const { quietModules, dotShape, cornerStyle } = options;
  const frameShape = options.frameShape ?? "none";
  const size = matrix.size;
  const layout = frameLayout(size, frameShape, quietModules);
  const modulePx = Math.max(
    1,
    Math.min(options.modulePx, Math.floor(MAX_SIDE_PX / Math.max(layout.cols, layout.rows))),
  );
  const width = layout.cols * modulePx;
  const height = layout.rows * modulePx;
  const fg = hexToRgb(options.foreground);
  const bg = hexToRgb(options.background);
  const frame = hexToRgb(options.frameColor ?? options.foreground);
  const data = new Uint8ClampedArray(width * height * 4);

  const isDark = (row: number, col: number) =>
    row >= 0 && col >= 0 && row < size && col < size && Boolean(matrix.get(row, col));

  // Fill the background, including the quiet zone.
  for (let i = 0; i < data.length; i += 4) {
    data[i] = bg[0];
    data[i + 1] = bg[1];
    data[i + 2] = bg[2];
    data[i + 3] = 255;
  }

  /**
   * Blend `tile` (side × side coverage) in `color` onto the image with its
   * top-left at canvas module (row, col).
   */
  const stamp = (row: number, col: number, tile: Float32Array, side: number, color: Rgb) => {
    const left = col * modulePx;
    const top = row * modulePx;
    for (let y = 0; y < side; y += 1) {
      for (let x = 0; x < side; x += 1) {
        const coverage = tile[y * side + x];
        if (coverage <= 0) continue;
        const i = ((top + y) * width + left + x) * 4;
        data[i] = bg[0] + (color[0] - bg[0]) * coverage;
        data[i + 1] = bg[1] + (color[1] - bg[1]) * coverage;
        data[i + 2] = bg[2] + (color[2] - bg[2]) * coverage;
      }
    }
  };

  // A module's shape depends only on which of its four orthogonal neighbors
  // are dark, so each of the 16 combinations is rasterized at most once.
  const tiles = new Map<number, Float32Array>();
  const moduleTile = (dark: (row: number, col: number) => boolean, row: number, col: number) => {
    const key =
      (dark(row - 1, col) ? 1 : 0) |
      (dark(row + 1, col) ? 2 : 0) |
      (dark(row, col - 1) ? 4 : 0) |
      (dark(row, col + 1) ? 8 : 0);
    let tile = tiles.get(key);
    if (!tile) {
      const neighbor = (dr: number, dc: number) =>
        (dr === -1 && (key & 1) !== 0) ||
        (dr === 1 && (key & 2) !== 0) ||
        (dc === -1 && (key & 4) !== 0) ||
        (dc === 1 && (key & 8) !== 0);
      tile = coverageTile(modulePx, 1, (u, v) => moduleDark(u, v, dotShape, neighbor));
      tiles.set(key, tile);
    }
    return tile;
  };

  const solid = new Float32Array(modulePx * modulePx).fill(1);
  const { qrRow, qrCol } = layout;

  // Data modules take the dot shape; timing, alignment, format and version
  // modules stay square.
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!isDark(row, col) || inFinder(size, row, col)) continue;
      const reserved = Boolean(matrix.isReserved?.(row, col));
      const tile = reserved ? solid : moduleTile(isDark, row, col);
      stamp(qrRow + row, qrCol + col, tile, modulePx, fg);
    }
  }

  // Finder patterns, drawn whole so their corners can be styled.
  const finder = coverageTile(modulePx, FINDER, (u, v) => finderDark(u, v, cornerStyle));
  for (const [row, col] of finderOrigins(size)) {
    stamp(qrRow + row, qrCol + col, finder, FINDER * modulePx, fg);
  }

  if (frameShape !== "none" && options.frameFill === "solid") {
    // The whole shape in the frame color, minus the code's window.
    for (const [row, col, tile] of solidFrameTiles(size, frameShape, layout, modulePx)) {
      stamp(row, col, tile, modulePx, frame);
    }
  } else if (frameShape !== "none") {
    // Decorative dots filling the rest of the frame, in the current dot shape.
    const { cols, rows } = layout;
    const cells = decorCells(size, frameShape, layout, options.seed ?? "");
    const isDecor = (row: number, col: number) =>
      row >= 0 && col >= 0 && row < rows && col < cols && cells[row * cols + col] === 1;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (cells[row * cols + col] === 1) {
          stamp(row, col, moduleTile(isDecor, row, col), modulePx, frame);
        }
      }
    }
  }

  return { width, height, modulePx, qrRow, qrCol, data };
}
