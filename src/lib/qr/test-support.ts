/**
 * Helpers shared by the QR tests: render a string, decode pixels with two
 * independent decoders, and degrade an image the way a phone camera might.
 * Pure Node, no canvas.
 */

import jsQR from "jsqr";
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  QRCodeReader,
  RGBLuminanceSource,
} from "@zxing/library";
import { create } from "qrcode/lib/browser.js";
import { renderQr, type RenderOptions, type RenderedQr } from "./render.ts";
import { effectiveEcc, type Ecc } from "./settings.ts";

export const INK = { foreground: "#1b1916", background: "#f6f3ed" };

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Render `text` the way the app does: ECC raised to Quartile when framed. */
export function renderText(text: string, options: Partial<RenderOptions> & { ecc?: Ecc } = {}) {
  const { ecc = "M", ...rest } = options;
  const frameShape = rest.frameShape ?? "none";
  const symbol = create(text, { errorCorrectionLevel: effectiveEcc(ecc, frameShape) });
  const image: RenderedQr = renderQr(symbol.modules, {
    modulePx: 8,
    quietModules: 4,
    dotShape: "square",
    cornerStyle: "square",
    ...INK,
    seed: text,
    ...rest,
  });
  return { symbol, image };
}

export function decodeJsqr(image: Pixels): string | null {
  return jsQR(image.data, image.width, image.height)?.data ?? null;
}

export function decodeZxing(image: Pixels): string | null {
  const luma = new Uint8ClampedArray(image.width * image.height);
  for (let i = 0; i < luma.length; i += 1) {
    const r = image.data[i * 4];
    const g = image.data[i * 4 + 1];
    const b = image.data[i * 4 + 2];
    luma[i] = (r * 299 + g * 587 + b * 114) / 1000;
  }
  const source = new RGBLuminanceSource(luma, image.width, image.height);
  const hints = new Map<DecodeHintType, unknown>([
    [DecodeHintType.TRY_HARDER, true],
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]],
  ]);
  try {
    return new QRCodeReader()
      .decode(new BinaryBitmap(new HybridBinarizer(source)), hints)
      .getText();
  } catch {
    return null;
  }
}

/** Half-size image, each output pixel the average of a 2×2 block (smoothing). */
export function downscaleHalf(image: Pixels): Pixels {
  const width = Math.floor(image.width / 2);
  const height = Math.floor(image.height / 2);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (let c = 0; c < 4; c += 1) {
        let sum = 0;
        for (const [dy, dx] of [
          [0, 0],
          [0, 1],
          [1, 0],
          [1, 1],
        ]) {
          sum += image.data[((y * 2 + dy) * image.width + x * 2 + dx) * 4 + c];
        }
        data[(y * width + x) * 4 + c] = Math.round(sum / 4);
      }
    }
  }
  return { data, width, height };
}

/** Mild blur: 3×3 binomial kernel (1 2 1 / 2 4 2 / 1 2 1), edges clamped. */
export function blur(image: Pixels): Pixels {
  const { width, height } = image;
  const data = new Uint8ClampedArray(image.data.length);
  const weights = [1, 2, 1];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (let c = 0; c < 4; c += 1) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const sy = Math.min(height - 1, Math.max(0, y + dy));
            const sx = Math.min(width - 1, Math.max(0, x + dx));
            sum += image.data[(sy * width + sx) * 4 + c] * weights[dy + 1] * weights[dx + 1];
          }
        }
        data[(y * width + x) * 4 + c] = Math.round(sum / 16);
      }
    }
  }
  return { data, width, height };
}
