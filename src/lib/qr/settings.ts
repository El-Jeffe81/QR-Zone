/**
 * Saved editor settings and color presets, kept free of React and the DOM so
 * they can be unit-tested.
 */
import type { FrameColorMode } from "./color.ts";
import { FRAME_SHAPES, type FrameShape } from "./frames.ts";
import { CORNER_STYLES, DOT_SHAPES, type CornerStyle, type DotShape } from "./render.ts";

export type Ecc = "L" | "M" | "Q" | "H";

export const STORAGE_KEY = "qr-zone:v1";
/** Key used before the app was renamed from Quiet Zone to QR Zone. */
export const LEGACY_STORAGE_KEY = "quiet-zone:v1";
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

export const FRAME_SHAPE_OPTIONS: readonly { id: FrameShape; name: string }[] = [
  { id: "none", name: "None" },
  { id: "circle", name: "Circle" },
  { id: "rounded", name: "Rounded square" },
  { id: "diamond", name: "Diamond" },
  { id: "triangle", name: "Triangle" },
  { id: "hexagon", name: "Hexagon" },
  { id: "star", name: "Star" },
  { id: "heart", name: "Heart" },
];

export const FRAME_COLOR_OPTIONS: readonly { id: FrameColorMode; name: string; note: string }[] = [
  { id: "match", name: "Match code", note: "Same as the code" },
  { id: "tint", name: "Lighter tint", note: "Softer than the code" },
  { id: "custom", name: "Custom", note: "Pick any color" },
];

export const DEFAULT_FRAME_COLOR = "#2f5d8a";

export interface Settings {
  content: string;
  fg: string;
  bg: string;
  ecc: Ecc;
  moduleSize: number;
  dotShape: DotShape;
  cornerStyle: CornerStyle;
  frameShape: FrameShape;
  frameColorMode: FrameColorMode;
  /** Used when frameColorMode is "custom". */
  frameColor: string;
}

export const DEFAULT_SETTINGS: Settings = {
  content: "",
  fg: DEFAULT_FG,
  bg: DEFAULT_BG,
  ecc: "M",
  moduleSize: 8,
  dotShape: "square",
  cornerStyle: "square",
  frameShape: "none",
  frameColorMode: "match",
  frameColor: DEFAULT_FRAME_COLOR,
};

const ECC_ORDER: readonly Ecc[] = ["L", "M", "Q", "H"];

/**
 * Error correction actually used. Frames put decoration close to the code,
 * so they need at least Quartile; with no frame the user's choice stands.
 */
export function effectiveEcc(chosen: Ecc, frameShape: FrameShape): Ecc {
  if (frameShape === "none") return chosen;
  return ECC_ORDER.indexOf(chosen) >= ECC_ORDER.indexOf("Q") ? chosen : "Q";
}

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

export function isFrameShape(value: unknown): value is FrameShape {
  return FRAME_SHAPES.includes(value as FrameShape);
}

export function isFrameColorMode(value: unknown): value is FrameColorMode {
  return value === "match" || value === "tint" || value === "custom";
}

export function isCornerStyle(value: unknown): value is CornerStyle {
  return CORNER_STYLES.includes(value as CornerStyle);
}

/**
 * Settings from a stored `qr-zone:v1` document. Missing, invalid or
 * unreadable fields fall back to the defaults, so data saved before a field
 * existed (e.g. without dot shape, corner style or frame) still loads.
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
  if (isFrameShape(saved.frameShape)) settings.frameShape = saved.frameShape;
  if (isFrameColorMode(saved.frameColorMode)) settings.frameColorMode = saved.frameColorMode;
  if (isHex(saved.frameColor)) settings.frameColor = saved.frameColor.toLowerCase();
  return settings;
}

/**
 * One-time migration from the pre-rename key: when `qr-zone:v1` is absent,
 * copy whatever `quiet-zone:v1` holds into it. The old key is left in place,
 * and an existing new value is never overwritten. Returns whether it copied.
 */
export function migrateLegacySettings(storage: Pick<Storage, "getItem" | "setItem">): boolean {
  if (storage.getItem(STORAGE_KEY) !== null) return false;
  const legacy = storage.getItem(LEGACY_STORAGE_KEY);
  if (legacy === null) return false;
  storage.setItem(STORAGE_KEY, legacy);
  return true;
}

export function serializeSettings(settings: Settings): string {
  return JSON.stringify(settings);
}
