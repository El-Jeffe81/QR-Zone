import { useEffect, useId, useRef, useState } from "react";
import { create, type ErrorCorrectionLevel } from "qrcode/lib/browser.js";
import { Ban, Download, Maximize2, QrCode, TriangleAlert, X } from "lucide-react";
import { contrastWarning, frameColorFor, type FrameColorMode } from "@/lib/qr/color";
import { frameIcon } from "@/lib/qr/frame-icons";
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
    <div className="flex min-w-0 flex-col gap-0.5">
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
          suppressHydrationWarning
          className="size-9 shrink-0 rounded-lg border border-line bg-field"
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
          className="h-9 w-[6.5rem] min-w-0 rounded-lg border border-line bg-field px-2.5 text-sm tracking-wide text-ink"
        />
      </div>
    </div>
  );
}

/** Focus ring for a label wrapping a transparent radio: keyboard focus only. */
const RADIO_FOCUS =
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent";

/**
 * The native radio is stretched, transparent, over its whole label, so it is
 * the element that is clicked and tapped, and keeps native keyboard behavior.
 */
const RADIO_OVERLAY = "absolute inset-0 m-0 cursor-pointer appearance-none opacity-0";

/**
 * A compact segmented radio group: short labels, the longer note kept as a
 * tooltip and as the radio's accessible description. Native radios with one
 * name, so arrow keys move between options.
 */
function Segmented<T extends string>({
  legend,
  hint,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  hint?: string;
  name: string;
  options: readonly { id: T; name: string; note?: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  const baseId = useId();
  return (
    <fieldset
      role="radiogroup"
      className="min-w-0"
      aria-describedby={hint ? `${baseId}-hint` : undefined}
    >
      <legend className="text-sm font-medium">{legend}</legend>
      {hint && (
        <p id={`${baseId}-hint`} className="sr-only">
          {hint}
        </p>
      )}
      <div className="mt-1.5 flex gap-1 rounded-lg border border-line bg-field p-0.5">
        {options.map((option) => {
          const selected = value === option.id;
          const noteId = `${baseId}-${option.id}-note`;
          return (
            <label
              key={option.id}
              title={option.note}
              className={`relative flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-md px-1.5 text-sm font-medium whitespace-nowrap ${RADIO_FOCUS} ${
                selected
                  ? "bg-accent-soft text-ink shadow-[inset_0_0_0_1px_var(--color-accent)]"
                  : "text-muted hover:text-ink"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.id}
                checked={selected}
                onChange={() => onChange(option.id)}
                aria-describedby={option.note ? noteId : undefined}
                suppressHydrationWarning
                className={RADIO_OVERLAY}
              />
              {option.name}
              {option.note && (
                // Hidden: read as the radio's description, not part of its name.
                <span id={noteId} hidden>
                  {option.note}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function FrameShapeIcon({ shape }: { shape: FrameShape }) {
  const icon = frameIcon(shape);
  if (!icon) return <Ban className="size-5" aria-hidden="true" />;
  return (
    <svg viewBox={icon.viewBox} className="size-5" aria-hidden="true" focusable="false">
      <path d={icon.d} fill="currentColor" />
    </svg>
  );
}

/** Icon-only radio group for the frame shape; names via aria-label and tooltip. */
function FramePicker({
  value,
  onChange,
}: {
  value: FrameShape;
  onChange: (next: FrameShape) => void;
}) {
  const hintId = useId();
  return (
    <fieldset role="radiogroup" className="min-w-0" aria-describedby={hintId}>
      <legend className="text-sm font-medium">Frame shape</legend>
      <p id={hintId} className="sr-only">
        Cuts the image to a shape and fills it with decorative dots. The code itself stays square
        in the middle.
      </p>
      <div className="mt-1.5 grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap">
        {FRAME_SHAPE_OPTIONS.map((option) => {
          const selected = value === option.id;
          return (
            <label
              key={option.id}
              title={option.name}
              className={`relative flex h-11 cursor-pointer items-center justify-center rounded-lg border sm:w-11 ${RADIO_FOCUS} ${
                selected
                  ? "border-accent bg-accent-soft text-accent shadow-[inset_0_0_0_1px_var(--color-accent)]"
                  : "border-line bg-field text-ink hover:border-muted"
              }`}
            >
              <input
                type="radio"
                name="frame-shape"
                value={option.id}
                checked={selected}
                onChange={() => onChange(option.id)}
                aria-label={option.name}
                suppressHydrationWarning
                className={RADIO_OVERLAY}
              />
              <FrameShapeIcon shape={option.id} />
            </label>
          );
        })}
      </div>
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
  const sizeHintId = `${baseId}-size-hint`;
  const previewHeadingId = `${baseId}-preview`;
  const optionsHeadingId = `${baseId}-options`;

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
  const [expanded, setExpanded] = useState(false);
  /** The button that opened the large view, so focus can go back to it. */
  const expandTrigger = useRef<HTMLButtonElement | null>(null);

  function openExpanded(trigger: HTMLButtonElement) {
    expandTrigger.current = trigger;
    setExpanded(true);
  }

  function closeExpanded() {
    setExpanded(false);
    expandTrigger.current?.focus();
  }
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

  const reducedToFit = meta !== null && meta.modulePx < moduleSize;
  const altText =
    content.trim().length > 120
      ? `QR code for ${content.trim().slice(0, 120)}…`
      : `QR code for ${content.trim()}`;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pt-3 pb-16 lg:px-6 lg:pt-4 lg:pb-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink text-surface"
            aria-hidden="true"
          >
            <QrCode className="size-5" />
          </span>
          <h1 className="font-display text-xl leading-none font-medium">QR Zone</h1>
          <p className="hidden truncate text-sm text-muted lg:block">
            Type a URL or any text, pick a style, save a PNG.
          </p>
        </div>
        <a
          href={`${import.meta.env.BASE_URL}QR-Zone.zip`}
          download="QR-Zone.zip"
          className="shrink-0 text-xs font-medium text-accent underline underline-offset-4 hover:text-accent-hover"
        >
          Project zip
        </a>
      </header>

      <div className="mt-3 lg:grid lg:grid-cols-[29rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        <section
          aria-labelledby={previewHeadingId}
          className="sticky top-0 z-20 -mx-4 border-b border-line bg-bg/95 px-4 pt-2 pb-2 backdrop-blur lg:top-4 lg:mx-0 lg:rounded-card lg:border lg:bg-surface lg:p-4 lg:shadow-panel"
        >
          <h2 id={previewHeadingId} className="sr-only">
            Preview
          </h2>
          <div className="mx-auto w-[min(100%,32svh)] lg:w-full">
            <button
              type="button"
              onClick={(event) => imageUrl && openExpanded(event.currentTarget)}
              disabled={!imageUrl}
              aria-label="Open large preview"
              title="Click to see it larger"
              className="relative block aspect-square w-full cursor-zoom-in overflow-hidden rounded-xl border border-line bg-field disabled:cursor-default"
            >
              {imageUrl ? (
                <img src={imageUrl} alt={altText} className="qr-preview h-full w-full" />
              ) : (
                <span className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted">
                  {error ? (
                    <TriangleAlert className="size-6 text-warn" aria-hidden="true" />
                  ) : (
                    <QrCode className="size-6" aria-hidden="true" />
                  )}
                  {error ? "This text can’t be encoded yet." : "Your code appears here as you type."}
                </span>
              )}
            </button>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={download}
                disabled={!imageUrl}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-field motion-safe:transition-colors hover:bg-accent-hover disabled:opacity-40"
              >
                <Download className="size-4" aria-hidden="true" />
                Download PNG
              </button>
              <button
                type="button"
                onClick={(event) => openExpanded(event.currentTarget)}
                disabled={!imageUrl}
                aria-label="Expand preview"
                title="Expand preview"
                className="flex size-10 items-center justify-center rounded-lg border border-line bg-field text-ink disabled:opacity-40"
              >
                <Maximize2 className="size-4" aria-hidden="true" />
              </button>
            </div>
            <p
              role="status"
              aria-live="polite"
              className={`mt-1.5 flex justify-center gap-1.5 text-center text-xs ${error || warning ? "text-warn" : "text-muted"}`}
            >
              {(error || warning) && <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />}
              <span>
                {statusText}
                {reducedToFit && meta ? ` Module size reduced to ${meta.modulePx} px to fit.` : ""}
              </span>
            </p>
          </div>
        </section>

        <div className="mt-3 flex min-w-0 flex-col gap-3 lg:mt-0">
          <section className="flex min-w-0 flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor={contentId} className="text-sm font-medium">
                URL or text
              </label>
              <span className="ml-auto text-xs text-muted tabular-nums" id={hintId}>
                {content.length === 0 ? "Links and plain text both work." : `${content.length} characters`}
              </span>
              <button
                type="button"
                onClick={() => setContent("")}
                disabled={content.length === 0}
                className="text-xs font-medium text-muted disabled:opacity-40"
              >
                Clear
              </button>
            </div>
            <textarea
              id={contentId}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={2}
              spellCheck={false}
              autoComplete="off"
              placeholder="https://example.com"
              aria-describedby={hintId}
              suppressHydrationWarning
              className="min-h-16 w-full resize-y rounded-xl border border-line bg-field px-3 py-2 text-ink placeholder:text-muted"
            />
          </section>

          <section
            aria-labelledby={optionsHeadingId}
            className="flex min-w-0 flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-panel"
          >
            <h2 id={optionsHeadingId} className="sr-only">
              Options
            </h2>

            <fieldset className="min-w-0">
              <legend className="text-sm font-medium">Colors</legend>
              <div className="mt-1.5 flex flex-wrap items-end gap-2">
                <div className="flex gap-2">
                  {SWATCHES.map((swatch) => {
                    const selected = fg === swatch.fg && bg === swatch.bg;
                    return (
                      <button
                        key={swatch.name}
                        type="button"
                        aria-pressed={selected}
                        title={`${swatch.name} preset`}
                        onClick={() => {
                          setFg(swatch.fg);
                          setBg(swatch.bg);
                        }}
                        className={`flex h-9 items-center gap-2 rounded-lg border px-2.5 text-sm font-medium ${
                          selected ? "border-accent bg-accent-soft" : "border-line bg-field"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="size-4 rounded border border-line"
                          style={{
                            background: `linear-gradient(135deg, ${swatch.fg} 50%, ${swatch.bg} 50%)`,
                          }}
                        />
                        {swatch.name}
                      </button>
                    );
                  })}
                </div>
                <ColorField id={fgId} label="Foreground" value={fg} onChange={setFg} />
                <ColorField id={bgId} label="Background" value={bg} onChange={setBg} />
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <Segmented
                legend="Dot shape"
                hint="Shape of the small modules that carry the data."
                name="dot-shape"
                options={DOT_SHAPE_OPTIONS}
                value={dotShape}
                onChange={setDotShape}
              />
              <Segmented
                legend="Corner style"
                hint="Shape of the three large squares scanners use to find the code."
                name="corner-style"
                options={CORNER_STYLE_OPTIONS}
                value={cornerStyle}
                onChange={setCornerStyle}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-2">
              <div className="grid gap-4 xl:grid-cols-[auto_minmax(0,1fr)]">
                <FramePicker value={frameShape} onChange={setFrameShape} />
                {frameShape !== "none" && (
                  <div className="flex min-w-0 flex-wrap items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <Segmented
                        legend="Frame color"
                        hint="Color of the decorative dots around the code."
                        name="frame-color"
                        options={FRAME_COLOR_OPTIONS}
                        value={frameColorMode}
                        onChange={setFrameColorMode}
                      />
                    </div>
                    {frameColorMode === "custom" && (
                      <ColorField
                        id={frameColorId}
                        label="Frame color"
                        value={frameColor}
                        onChange={setFrameColor}
                      />
                    )}
                  </div>
                )}
              </div>
              {frameShape !== "none" && usedEcc !== ecc && (
                <p className="text-xs text-warn">
                  Frames use at least Quartile, so Quartile is used while a frame is on. Your choice
                  returns when the frame is None.
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Segmented
                legend="Error correction"
                hint="Higher levels survive scratches and logos, and fit less text."
                name="error-correction"
                options={LEVELS.map((level) => ({
                  id: level.id,
                  name: level.name,
                  note: `${level.recovery} recovery`,
                }))}
                value={ecc}
                onChange={setEcc}
              />
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor={sizeId} className="text-sm font-medium">
                    Module size
                  </label>
                  <output htmlFor={sizeId} className="text-xs text-muted tabular-nums">
                    {reducedToFit && meta ? `${meta.modulePx} px (reduced to fit)` : `${moduleSize} px`}
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
                  aria-describedby={sizeHintId}
                  suppressHydrationWarning
                  className="h-10"
                />
                <p id={sizeHintId} className="sr-only">
                  Larger modules stay sharp when the PNG is printed or scanned.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>

      {expanded && imageUrl && (
        <PreviewDialog
          imageUrl={imageUrl}
          alt={altText}
          onDownload={download}
          onClose={closeExpanded}
        />
      )}
    </main>
  );
}

/**
 * Large view of the code in a native modal dialog. Close gets focus when it
 * opens; Escape, Close and a click on the backdrop all close it through the
 * dialog's own close event, and the caller puts focus back on its trigger.
 */
function PreviewDialog({
  imageUrl,
  alt,
  onDownload,
  onClose,
}: {
  imageUrl: string;
  alt: string;
  onDownload: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    closeRef.current?.focus();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) ref.current?.close();
      }}
      className="m-auto max-h-none max-w-none bg-transparent p-0 backdrop:bg-ink/90 backdrop:backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-3 p-3">
        <h2 id={titleId} className="sr-only">
          QR code, large view
        </h2>
        <img
          src={imageUrl}
          alt={alt}
          className="qr-preview size-[min(92vw,calc(100svh-6rem))] rounded-xl bg-field"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDownload}
            className="flex h-11 items-center gap-2 rounded-lg bg-accent px-4 font-semibold text-field hover:bg-accent-hover"
          >
            <Download className="size-4" aria-hidden="true" />
            Download PNG
          </button>
          <button
            ref={closeRef}
            type="button"
            onClick={() => ref.current?.close()}
            className="flex h-11 items-center gap-2 rounded-lg border border-line bg-field px-4 font-semibold text-ink"
          >
            <X className="size-4" aria-hidden="true" />
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}
