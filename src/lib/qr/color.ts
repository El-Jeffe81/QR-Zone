/** Color math for the code, background and frame colors. Pure functions. */

/** WCAG relative luminance of a #rrggbb color, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const channel = (index: number) => {
    const value = Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** WCAG contrast ratio between two colors, 1 to 21, order-independent. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Code-vs-background contrast below this gets a (non-blocking) warning. */
export const MIN_CONTRAST = 4.5;

/**
 * A short warning when the code and background colors are too close to scan
 * reliably, else null. Light-on-dark is fine as long as the contrast holds.
 */
export function contrastWarning(foreground: string, background: string): string | null {
  const ratio = contrastRatio(foreground, background);
  if (ratio >= MIN_CONTRAST) return null;
  // Round down so 4.48 reads as 4.4, never as the 4.5 it falls short of.
  const shown = (Math.floor(ratio * 10) / 10).toFixed(1);
  return `Contrast is ${shown}:1. Aim for at least ${MIN_CONTRAST}:1 so phones scan it reliably.`;
}

/** Linear mix of two #rrggbb colors in sRGB; `amount` 0 gives `from`, 1 gives `to`. */
export function mixColors(from: string, to: string, amount: number): string {
  const part = (hex: string, index: number) =>
    Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  const out = [0, 1, 2].map((index) => {
    const value = Math.round(part(from, index) + (part(to, index) - part(from, index)) * amount);
    return value.toString(16).padStart(2, "0");
  });
  return `#${out.join("")}`;
}

/**
 * How far the "Lighter tint" frame color moves from the code color toward
 * the background: far enough that decoration reads as softer than the code,
 * not so far that it disappears.
 */
export const TINT_AMOUNT = 0.55;

export type FrameColorMode = "match" | "tint" | "custom";

/** The #rrggbb the decorative dots are drawn in. */
export function frameColorFor(
  mode: FrameColorMode,
  foreground: string,
  background: string,
  custom: string,
): string {
  if (mode === "tint") return mixColors(foreground, background, TINT_AMOUNT);
  if (mode === "custom") return custom;
  return foreground;
}
