import { useEffect, useId, useState } from "react";
import { create, type ErrorCorrectionLevel } from "qrcode/lib/browser.js";
import { Download, QrCode, TriangleAlert } from "lucide-react";

const STORAGE_KEY = "quiet-zone:v1";
const QUIET_MODULES = 4;
const MODULE_MIN = 4;
const MODULE_MAX = 16;
const DEFAULT_FG = "#1b1916";
const DEFAULT_BG = "#f6f3ed";

const LEVELS: { id: ErrorCorrectionLevel; name: string; recovery: string }[] = [
  { id: "L", name: "Low", recovery: "7%" },
  { id: "M", name: "Medium", recovery: "15%" },
  { id: "Q", name: "Quartile", recovery: "25%" },
  { id: "H", name: "High", recovery: "30%" },
];

const SWATCHES: { name: string; fg: string; bg: string }[] = [
  { name: "Ink", fg: "#1b1916", bg: "#f6f3ed" },
  { name: "Inverse", fg: "#f6f3ed", bg: "#1b1916" },
];

type Ecc = ErrorCorrectionLevel;

type Saved = {
  content?: unknown;
  fg?: unknown;
  bg?: unknown;
  ecc?: unknown;
  moduleSize?: unknown;
};

type Meta = {
  px: number;
  version: number;
  modules: number;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

function isEcc(value: unknown): value is Ecc {
  return value === "L" || value === "M" || value === "Q" || value === "H";
}

function isHex(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

function channel(hex: string, index: number) {
  const value = Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  return 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
}

function contrastRatio(foreground: string, background: string) {
  const a = luminance(foreground);
  const b = luminance(background);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

function scanNote(foreground: string, background: string) {
  const ratio = contrastRatio(foreground, background);
  const inverted = luminance(foreground) > luminance(background);
  if (ratio < 3) {
    return `Contrast is ${ratio.toFixed(1)}:1. Darker marks on a lighter field scan more reliably.`;
  }
  if (inverted) {
    return "Light marks on a dark field. Dark-on-light is more reliable on phone cameras.";
  }
  return null;
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : "Could not build this code.";
  if (/too big|too long/i.test(message)) {
    return "That text is too long for this error correction level. Shorten it, or choose Low.";
  }
  return message;
}

function paint(
  canvas: HTMLCanvasElement,
  text: string,
  ecc: Ecc,
  foreground: string,
  background: string,
  modulePx: number,
): Meta {
  const symbol = create(text, { errorCorrectionLevel: ecc });
  const modules = symbol.modules.size;
  const span = modules + QUIET_MODULES * 2;
  const px = modulePx * span;
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the code.");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = foreground;
  for (let row = 0; row < modules; row += 1) {
    for (let col = 0; col < modules; col += 1) {
      if (symbol.modules.get(row, col)) {
        ctx.fillRect((col + QUIET_MODULES) * modulePx, (row + QUIET_MODULES) * modulePx, modulePx, modulePx);
      }
    }
  }
  return { px, version: symbol.version, modules };
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

export function QrStudio() {
  const baseId = useId();
  const contentId = `${baseId}-content`;
  const fgId = `${baseId}-fg`;
  const bgId = `${baseId}-bg`;
  const sizeId = `${baseId}-size`;
  const hintId = `${baseId}-hint`;

  const [content, setContent] = useState("");
  const [fg, setFg] = useState(DEFAULT_FG);
  const [bg, setBg] = useState(DEFAULT_BG);
  const [ecc, setEcc] = useState<Ecc>("M");
  const [moduleSize, setModuleSize] = useState(8);
  const [hydrated, setHydrated] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Saved;
        if (typeof saved.content === "string") setContent(saved.content);
        if (isHex(saved.fg)) setFg(saved.fg.toLowerCase());
        if (isHex(saved.bg)) setBg(saved.bg.toLowerCase());
        if (isEcc(saved.ecc)) setEcc(saved.ecc);
        if (
          typeof saved.moduleSize === "number" &&
          saved.moduleSize >= MODULE_MIN &&
          saved.moduleSize <= MODULE_MAX
        ) {
          setModuleSize(saved.moduleSize);
        }
      }
    } catch {
      /* ignore unreadable settings */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ content, fg, bg, ecc, moduleSize }));
  }, [hydrated, content, fg, bg, ecc, moduleSize]);

  useEffect(() => {
    if (content.trim() === "") {
      setImageUrl(null);
      setMeta(null);
      setError(null);
      return;
    }
    try {
      const canvas = document.createElement("canvas");
      const next = paint(canvas, content, ecc, fg, bg, moduleSize);
      setImageUrl(canvas.toDataURL("image/png"));
      setMeta(next);
      setError(null);
    } catch (err) {
      setImageUrl(null);
      setMeta(null);
      setError(friendlyError(err));
    }
  }, [content, ecc, fg, bg, moduleSize]);

  const warning = imageUrl ? scanNote(fg, bg) : null;
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
          <h1 className="font-display text-3xl leading-tight font-medium text-balance sm:text-5xl">Quiet Zone</h1>
          <p className="mt-2 max-w-xl text-pretty text-muted">
            Type a URL or any text. The code redraws immediately — then save a PNG.
          </p>
          <a
            href={`${import.meta.env.BASE_URL}QR_Generator.zip`}
            download="QR_Generator.zip"
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

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor={sizeId} className="text-sm font-medium">
                Module size
              </label>
              <output htmlFor={sizeId} className="text-sm text-muted tabular-nums">
                {moduleSize} px
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
