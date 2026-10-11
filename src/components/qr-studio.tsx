import { type ReactNode, useEffect, useId, useState } from "react";
import { create, type ErrorCorrectionLevel } from "qrcode/lib/browser.js";
import { Download, QrCode, TriangleAlert } from "lucide-react";
import { contrastWarning, frameColorFor, type FrameColorMode } from "@/lib/qr/color";
import type { FrameShape } from "@/lib/qr/frames";
import { renderQr, type CornerStyle, type DotShape } from "@/lib/qr/render";
import {
  CORNER_STYLE_OPTIONS,
  DEFAULT_SETTINGS,
  DOT_SHAPE_OPTIONS,
  FRAME_COLOR_OPTIONS,
  FRAME_SHAPE_OPTIONS,
  HEX,
  MODULE_MAX,
  MODULE_MIN,
  STORAGE_KEY,
  SWATCHES,
  effectiveEcc,
  migrateLegacySettings,
  parseSettings,
  serializeSettings,
} from "@/lib/qr/settings";

const QUIET_MODULES = 4;

const LEVELS: { id: ErrorCorrectionLevel; name: string; recovery: string }[] = [
  { id: "L", name: "Low", recovery: "7%" },
  { id: "M", name: "Medium", recovery: "15%" },
  { id: "Q", name: "Quartile", recovery: "25%" },
  { id: "H", name: "High", recovery: "30%" },
];

type Ecc = ErrorCorrectionLevel;

type Meta = {
  px: number;
  version: number;
  modules: number;
  /** Pixels per module actually drawn; below the slider value for very large frames. */
  modulePx: number;
};

type PaintOptions = {
  text: string;
  ecc: Ecc;
  foreground: string;
  background: string;
  modulePx: number;
  dotShape: DotShape;
  cornerStyle: CornerStyle;
  frameShape: FrameShape;
  frameColor: string;
};

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : "Could not build this code.";
  if (/too big|too long/i.test(message)) {
    return "That text is too long for this error correction level. Shorten it, or choose Low.";
  }
  return message;
}

function paint(canvas: HTMLCanvasElement, options: PaintOptions): Meta {
  const { text, ecc, ...style } = options;
  const symbol = create(text, { errorCorrectionLevel: ecc });
  const modules = symbol.modules.size;
  // The PNG is these exact pixels: the preview <img> and the download both
  // come from this canvas. The seed (text plus every visual setting) makes
  // the decorative frame pattern repeatable.
  const image = renderQr(symbol.modules, {
    ...style,
    quietModules: QUIET_MODULES,
    seed: JSON.stringify(options),
  });
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the code.");
  ctx.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  return { px: image.width, version: symbol.version, modules, modulePx: image.modulePx };
}

function fileName(text: string) {
  const trimmed = text.trim();
  try {
    const host = new URL(trimmed).hostname.replace(/^www\./, "").replace(/[^a-z0-9.-]+/gi, "");
    if (host) return `qr-${host}.png`;
  } catch {
    /* not a url */
  }
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return slug ? `qr-${slug}.png` : "qr-code.png";
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value.toUpperCase());

  useEffect(() => {
    setDraft(value.toUpperCase());
  }, [value]);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
          suppressHydrationWarning
          className="size-11 shrink-0 rounded-lg border border-line bg-field"
        />
        <input
          type="text"
          value={draft}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          maxLength={7}
          aria-label={`${label} hex`}
          suppressHydrationWarning
          onChange={(event) => {
            const next = event.target.value.toUpperCase();
            setDraft(next);
            if (HEX.test(next)) onChange(next.toLowerCase());
          }}
          onBlur={() => setDraft(value.toUpperCase())}
          className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-field px-3 tracking-wide text-ink"
        />
      </div>
    </div>
  );
}

function OptionGroup<T extends string>({
  legend,
  hint,
  name,
  options,
  value,
  onChange,
  columns = "grid-cols-3",
  children,
}: {
  legend: string;
  hint: string;
  name: string;
  options: readonly { id: T; name: string; note?: string }[];
  value: T;
  onChange: (next: T) => void;
  columns?: string;
  children?: ReactNode;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{legend}</legend>
      <p className="mt-1 text-sm text-muted">{hint}</p>
      <div className={`mt-3 grid gap-2 ${columns}`}>
        {options.map((option) => {
          const selected = value === option.id;
          return (
            <label
              key={option.id}
              className={`flex min-h-11 cursor-pointer flex-col justify-center rounded-lg border px-3 py-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${
                selected ? "border-accent bg-accent-soft" : "border-line bg-field"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.id}
                checked={selected}
                onChange={() => onChange(option.id)}
                suppressHydrationWarning
                className="sr-only"
              />
              <span className="text-sm font-medium">{option.name}</span>
              {option.note && <span className="text-sm text-muted">{option.note}</span>}
            </label>
          );
        })}
      </div>
      {children}
    </fieldset>
  );
}

export function QrStudio() {
  const baseId = useId();
  const contentId = `${baseId}-content`;
  const fgId = `${baseId}-fg`;
  const bgId = `${baseId}-bg`;
  const sizeId = `${baseId}-size`;
  const hintId = `${baseId}-hint`;
  const frameColorId = `${baseId}-frame-color`;

  const [content, setContent] = useState(DEFAULT_SETTINGS.content);
  const [fg, setFg] = useState(DEFAULT_SETTINGS.fg);
  const [bg, setBg] = useState(DEFAULT_SETTINGS.bg);
  const [ecc, setEcc] = useState<Ecc>(DEFAULT_SETTINGS.ecc);
  const [moduleSize, setModuleSize] = useState(DEFAULT_SETTINGS.moduleSize);
  const [dotShape, setDotShape] = useState<DotShape>(DEFAULT_SETTINGS.dotShape);
  const [cornerStyle, setCornerStyle] = useState<CornerStyle>(DEFAULT_SETTINGS.cornerStyle);
  const [frameShape, setFrameShape] = useState<FrameShape>(DEFAULT_SETTINGS.frameShape);
  const [frameColorMode, setFrameColorMode] = useState<FrameColorMode>(
    DEFAULT_SETTINGS.frameColorMode,
  );
  const [frameColor, setFrameColor] = useState(DEFAULT_SETTINGS.frameColor);
  const [hydrated, setHydrated] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let raw: string | null = null;
    try {
      // Settings saved under the pre-rename key carry over once.
      migrateLegacySettings(localStorage);
    } catch {
      /* storage full or unavailable: read whatever is there below */
    }
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* storage unavailable: keep the defaults */
    }
    const saved = parseSettings(raw);
    setContent(saved.content);
    setFg(saved.fg);
    setBg(saved.bg);
    setEcc(saved.ecc);
    setModuleSize(saved.moduleSize);
    setDotShape(saved.dotShape);
    setCornerStyle(saved.cornerStyle);
    setFrameShape(saved.frameShape);
    setFrameColorMode(saved.frameColorMode);
    setFrameColor(saved.frameColor);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        serializeSettings({
          content,
          fg,
          bg,
          ecc,
          moduleSize,
          dotShape,
          cornerStyle,
          frameShape,
          frameColorMode,
          frameColor,
        }),
      );
    } catch {
      /* storage full or unavailable: settings just won't persist */
    }
  }, [
    hydrated,
    content,
    fg,
    bg,
    ecc,
    moduleSize,
    dotShape,
    cornerStyle,
    frameShape,
    frameColorMode,
    frameColor,
  ]);

  const usedEcc = effectiveEcc(ecc, frameShape);
  const resolvedFrameColor = frameColorFor(frameColorMode, fg, bg, frameColor);

  useEffect(() => {
    if (content.trim() === "") {
      setImageUrl(null);
      setMeta(null);
      setError(null);
      return;
    }
    try {
      const canvas = document.createElement("canvas");
      const next = paint(canvas, {
        text: content,
        ecc: usedEcc,
        foreground: fg,
        background: bg,
        modulePx: moduleSize,
        dotShape,
        cornerStyle,
        frameShape,
        frameColor: resolvedFrameColor,
      });
      setImageUrl(canvas.toDataURL("image/png"));
      setMeta(next);
      setError(null);
    } catch (err) {
      setImageUrl(null);
      setMeta(null);
      setError(friendlyError(err));
    }
  }, [content, usedEcc, fg, bg, moduleSize, dotShape, cornerStyle, frameShape, resolvedFrameColor]);

  const warning = imageUrl ? contrastWarning(fg, bg) : null;
  const statusText = error
    ? error
    : warning
      ? warning
      : meta
        ? `Version ${meta.version}. ${meta.px} by ${meta.px} pixels. Ready to download.`
        : "The preview updates as you type.";

  function download() {
    if (!imageUrl) return;
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = fileName(content);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 pb-24 sm:px-6 sm:py-12">
      <header className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-ink text-surface" aria-hidden="true">
          <QrCode className="size-6" />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-3xl leading-tight font-medium text-balance sm:text-5xl">QR Zone</h1>
          <p className="mt-2 max-w-xl text-pretty text-muted">
            Type a URL or any text. The code redraws immediately — then save a PNG.
          </p>
          <a
            href={`${import.meta.env.BASE_URL}QR-Zone.zip`}
            download="QR-Zone.zip"
            className="mt-4 inline-flex h-11 items-center rounded-lg bg-accent px-4 font-semibold text-field"
          >
            Download project zip
          </a>
        </div>
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="flex min-w-0 flex-col gap-2 lg:col-start-1 lg:row-start-1">
          <div className="flex items-end justify-between gap-3">
            <label htmlFor={contentId} className="text-sm font-medium">
              URL or text
            </label>
            <button
              type="button"
              onClick={() => setContent("")}
              disabled={content.length === 0}
              className="text-sm font-medium text-muted disabled:opacity-40"
            >
              Clear
            </button>
          </div>
          <textarea
            id={contentId}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={4}
            spellCheck={false}
            autoComplete="off"
            placeholder="https://example.com"
            aria-describedby={hintId}
            suppressHydrationWarning
            className="min-h-28 w-full resize-y rounded-xl border border-line bg-field px-3 py-3 text-ink placeholder:text-muted"
          />
          <p id={hintId} className="text-sm text-muted tabular-nums">
            {content.length === 0 ? "Links and plain text both work." : `${content.length} characters`}
          </p>
        </section>

        <aside className="min-w-0 rounded-card border border-line bg-surface p-4 shadow-panel sm:p-5 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <h2 className="text-sm font-medium">Preview</h2>
          <div className="relative mt-3 aspect-square w-full overflow-hidden rounded-xl border border-line bg-field">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={
                  content.trim().length > 120
                    ? `QR code for ${content.trim().slice(0, 120)}…`
                    : `QR code for ${content.trim()}`
                }
                className="qr-preview h-full w-full"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted">
                {error ? (
                  <TriangleAlert className="size-8 text-warn" aria-hidden="true" />
                ) : (
                  <QrCode className="size-8" aria-hidden="true" />
                )}
                <p>{error ? "This text can’t be encoded yet." : "Your code appears here as soon as you type."}</p>
              </div>
            )}
          </div>
          <p
            role="status"
            aria-live="polite"
            className={`mt-3 flex gap-2 text-sm ${error || warning ? "text-warn" : "text-muted"}`}
          >
            {(error || warning) && <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
            <span>{statusText}</span>
          </p>
          <button
            type="button"
            onClick={download}
            disabled={!imageUrl}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent font-semibold text-field motion-safe:transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            <Download className="size-4" aria-hidden="true" />
            Download PNG
          </button>
        </aside>

        <section className="flex min-w-0 flex-col gap-8 lg:col-start-1 lg:row-start-2">
          <fieldset className="min-w-0">
            <legend className="text-sm font-medium">Colors</legend>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <ColorField id={fgId} label="Foreground" value={fg} onChange={setFg} />
              <ColorField id={bgId} label="Background" value={bg} onChange={setBg} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {SWATCHES.map((swatch) => {
                const selected = fg === swatch.fg && bg === swatch.bg;
                return (
                  <button
                    key={swatch.name}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setFg(swatch.fg);
                      setBg(swatch.bg);
                    }}
                    className={`flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium ${
                      selected ? "border-accent bg-accent-soft" : "border-line bg-field"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="size-5 rounded border border-line"
                      style={{
                        background: `linear-gradient(135deg, ${swatch.fg} 50%, ${swatch.bg} 50%)`,
                      }}
                    />
                    {swatch.name}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <OptionGroup
            legend="Dot shape"
            hint="Shape of the small modules that carry the data."
            name="dot-shape"
            options={DOT_SHAPE_OPTIONS}
            value={dotShape}
            onChange={setDotShape}
          />

          <OptionGroup
            legend="Corner style"
            hint="Shape of the three large squares scanners use to find the code."
            name="corner-style"
            options={CORNER_STYLE_OPTIONS}
            value={cornerStyle}
            onChange={setCornerStyle}
          />

          <OptionGroup
            legend="Frame shape"
            hint="Cuts the image to a shape and fills it with decorative dots. The code itself stays square in the middle."
            name="frame-shape"
            options={FRAME_SHAPE_OPTIONS}
            value={frameShape}
            onChange={setFrameShape}
            columns="grid-cols-2 sm:grid-cols-4"
          />

          {frameShape !== "none" && (
            <OptionGroup
              legend="Frame color"
              hint="Color of the decorative dots around the code."
              name="frame-color"
              options={FRAME_COLOR_OPTIONS}
              value={frameColorMode}
              onChange={setFrameColorMode}
            >
              {frameColorMode === "custom" && (
                <div className="mt-3 max-w-xs">
                  <ColorField
                    id={frameColorId}
                    label="Frame color"
                    value={frameColor}
                    onChange={setFrameColor}
                  />
                </div>
              )}
            </OptionGroup>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor={sizeId} className="text-sm font-medium">
                Module size
              </label>
              <output htmlFor={sizeId} className="text-sm text-muted tabular-nums">
                {meta && meta.modulePx < moduleSize
                  ? `${meta.modulePx} px (reduced to fit)`
                  : `${moduleSize} px`}
                {meta ? ` · ${meta.px}×${meta.px}` : ""}
              </output>
            </div>
            <input
              id={sizeId}
              type="range"
              min={MODULE_MIN}
              max={MODULE_MAX}
              step={1}
              value={moduleSize}
              onChange={(event) => setModuleSize(Number(event.target.value))}
              aria-valuemin={MODULE_MIN}
              aria-valuemax={MODULE_MAX}
              aria-valuenow={moduleSize}
              aria-valuetext={`${moduleSize} pixels per module`}
              suppressHydrationWarning
            />
            <p className="text-sm text-muted">Larger modules stay sharp when the PNG is printed or scanned.</p>
          </div>

          <fieldset>
            <legend className="text-sm font-medium">Error correction</legend>
            <p className="mt-1 text-sm text-muted">
              Higher levels survive scratches and logos, and fit less text.
            </p>
            {usedEcc !== ecc && (
              <p className="mt-1 text-sm text-warn">
                Frames use at least Quartile, so Quartile is used while a frame is on. Your choice
                returns when the frame is None.
              </p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {LEVELS.map((level) => {
                const selected = ecc === level.id;
                return (
                  <label
                    key={level.id}
                    className={`flex min-h-11 cursor-pointer flex-col justify-center rounded-lg border px-3 py-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${
                      selected ? "border-accent bg-accent-soft" : "border-line bg-field"
                    }`}
                  >
                    <input
                      type="radio"
                      name="error-correction"
                      value={level.id}
                      checked={selected}
                      onChange={() => setEcc(level.id)}
                      suppressHydrationWarning
                      className="sr-only"
                    />
                    <span className="text-sm font-medium">{level.name}</span>
                    <span className="text-sm text-muted">{level.recovery} recovery</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </section>
      </div>
    </main>
  );
}
