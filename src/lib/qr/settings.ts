/**
 * Saved editor settings and color presets, kept free of React and the DOM so
 * they can be unit-tested.
 */
import { CORNER_STYLES, DOT_SHAPES, type CornerStyle, type DotShape } from "./render.ts";

export type Ecc = "L" | "M" | "Q" | "H";

export const STORAGE_KEY = "quiet-zone:v1";
export const MODULE_MIN = 4;
export const MODULE_MAX = 16;
export const DEFAULT_FG = "#1b1916";
export const DEFAULT_BG = "#f6f3ed";

export const SWATCHES: readonly { name: string; fg: string; bg: string }[] = [
  { name: "Ink", fg: DEFAULT_FG, bg: DEFAULT_BG },
  { name: "Inverse", fg: DEFAULT_BG, bg: DEFAULT_FG },
];

export const DOT_SHAPE_OPTIONS: readonly { id: DotShape; name: string; note: string }[] = [
  { id: "square", name: "Square", note: "Classic blocks" },
  { id: "rounded", name: "Rounded", note: "Soft, joined edges" },
  { id: "dots", name: "Dots", note: "Separate circles" },
];

export const CORNER_STYLE_OPTIONS: readonly { id: CornerStyle; name: string; note: string }[] = [
  { id: "square", name: "Square", note: "Sharp corners" },
  { id: "rounded", name: "Rounded", note: "Softened corners" },
  { id: "circle", name: "Circle", note: "Round eyes" },
];

export interface Settings {
  content: string;
  fg: string;
  bg: string;
  ecc: Ecc;
  moduleSize: number;
  dotShape: DotShape;
  cornerStyle: CornerStyle;
}

export const DEFAULT_SETTINGS: Settings = {
  content: "",
  fg: DEFAULT_FG,
  bg: DEFAULT_BG,
  ecc: "M",
  moduleSize: 8,
  dotShape: "square",
  cornerStyle: "square",
};

export const HEX = /^#[0-9a-fA-F]{6}$/;

export function isEcc(value: unknown): value is Ecc {
  return value === "L" || value === "M" || value === "Q" || value === "H";
}

export function isHex(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

export function isDotShape(value: unknown): value is DotShape {
  return DOT_SHAPES.includes(value as DotShape);
}

export function isCornerStyle(value: unknown): value is CornerStyle {
  return CORNER_STYLES.includes(value as CornerStyle);
}

/**
 * Settings from a stored `quiet-zone:v1` document. Missing, invalid or
 * unreadable fields fall back to the defaults, so data saved before a field
 * existed (e.g. without dot shape or corner style) still loads.
 */
export function parseSettings(raw: string | null | undefined): Settings {
  const settings = { ...DEFAULT_SETTINGS };
  if (!raw) return settings;
  let saved: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return settings;
    saved = parsed as Record<string, unknown>;
  } catch {
    return settings;
  }
  if (typeof saved.content === "string") settings.content = saved.content;
  if (isHex(saved.fg)) settings.fg = saved.fg.toLowerCase();
  if (isHex(saved.bg)) settings.bg = saved.bg.toLowerCase();
  if (isEcc(saved.ecc)) settings.ecc = saved.ecc;
  if (
    typeof saved.moduleSize === "number" &&
    Number.isInteger(saved.moduleSize) &&
    saved.moduleSize >= MODULE_MIN &&
    saved.moduleSize <= MODULE_MAX
  ) {
    settings.moduleSize = saved.moduleSize;
  }
  if (isDotShape(saved.dotShape)) settings.dotShape = saved.dotShape;
  if (isCornerStyle(saved.cornerStyle)) settings.cornerStyle = saved.cornerStyle;
  return settings;
}

export function serializeSettings(settings: Settings): string {
  return JSON.stringify(settings);
}
