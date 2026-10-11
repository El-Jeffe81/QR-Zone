/**
 * Pure QR raster renderer: turns a QR module matrix into RGBA pixels.
 *
 * Both the canvas preview (and therefore the downloaded PNG) and the decode
 * tests use this one function, so what the tests scan is exactly what the
 * user sees. No DOM or canvas APIs here.
 */

export type DotShape = "square" | "rounded" | "dots";
export type CornerStyle = "square" | "rounded" | "circle";

export const DOT_SHAPES: readonly DotShape[] = ["square", "rounded", "dots"];
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
}

export interface RenderedQr {
  width: number;
  height: number;
  /** RGBA, row-major, `width * height * 4` bytes. */
  data: Uint8ClampedArray<ArrayBuffer>;
}

/** Finder patterns are 7×7 modules in three corners of every symbol. */
const FINDER = 7;
/** Dot radius in module units; just under half so neighbors stay distinct. */
const DOT_RADIUS = 0.45;
/** Sub-samples per pixel axis on curved edges (anti-aliasing). */
const SUPERSAMPLE = 4;

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

/** Render `matrix` to RGBA pixels with the chosen shapes and colors. */
export function renderQr(matrix: ModuleMatrix, options: RenderOptions): RenderedQr {
  const { modulePx, quietModules, dotShape, cornerStyle } = options;
  const size = matrix.size;
  const width = (size + quietModules * 2) * modulePx;
  const fg = hexToRgb(options.foreground);
  const bg = hexToRgb(options.background);
  const data = new Uint8ClampedArray(width * width * 4);

  const isDark = (row: number, col: number) =>
    row >= 0 && col >= 0 && row < size && col < size && Boolean(matrix.get(row, col));

  // Fill the background, including the quiet zone.
  for (let i = 0; i < data.length; i += 4) {
    data[i] = bg[0];
    data[i + 1] = bg[1];
    data[i + 2] = bg[2];
    data[i + 3] = 255;
  }

  /** Blend `tile` (side × side coverage) onto the image at module (row, col). */
  const stamp = (row: number, col: number, tile: Float32Array, side: number) => {
    const left = (col + quietModules) * modulePx;
    const top = (row + quietModules) * modulePx;
    for (let y = 0; y < side; y += 1) {
      for (let x = 0; x < side; x += 1) {
        const coverage = tile[y * side + x];
        if (coverage <= 0) continue;
        const i = ((top + y) * width + left + x) * 4;
        data[i] = bg[0] + (fg[0] - bg[0]) * coverage;
        data[i + 1] = bg[1] + (fg[1] - bg[1]) * coverage;
        data[i + 2] = bg[2] + (fg[2] - bg[2]) * coverage;
      }
    }
  };

  // A module's shape depends only on which of its four orthogonal neighbors
  // are dark, so each of the 16 combinations is rasterized at most once.
  const tiles = new Map<number, Float32Array>();
  const moduleTile = (row: number, col: number) => {
    const key =
      (isDark(row - 1, col) ? 1 : 0) |
      (isDark(row + 1, col) ? 2 : 0) |
      (isDark(row, col - 1) ? 4 : 0) |
      (isDark(row, col + 1) ? 8 : 0);
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

  // Data modules take the dot shape; timing, alignment, format and version
  // modules stay square.
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!isDark(row, col) || inFinder(size, row, col)) continue;
      const reserved = Boolean(matrix.isReserved?.(row, col));
      stamp(row, col, reserved ? solid : moduleTile(row, col), modulePx);
    }
  }

  // Finder patterns, drawn whole so their corners can be styled.
  const finder = coverageTile(modulePx, FINDER, (u, v) => finderDark(u, v, cornerStyle));
  for (const [row, col] of finderOrigins(size)) stamp(row, col, finder, FINDER * modulePx);

  return { width, height: width, data };
}
