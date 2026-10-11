# QR Zone

[![CI](https://github.com/El-Jeffe81/QR-Zone/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/El-Jeffe81/QR-Zone/actions/workflows/ci.yml)

CI badge: green = tests and both builds pass (typecheck, lint, `npm test`, `npm run build` and `npm run build:pages` on Node 22).

A QR code generator. Type a URL or any text and the code redraws immediately. Set foreground and background colors, dot shape, corner style, frame shape, module size, and error correction, then download a PNG.

**Live:** https://el-jeffe81.github.io/QR-Zone/

Everything runs in the browser: the `qrcode` library encodes the text, the app draws the modules onto a canvas itself, and your last settings (including the shape choices) are kept in `localStorage` under `qr-zone:v1` (settings saved by older versions under `quiet-zone:v1` are carried over automatically). No account or server is needed.

## Shape options

| Option | Choices | What it changes |
| --- | --- | --- |
| Dot shape | **Square** (default), Rounded, Dots | The small data modules. Rounded softens outer corners and joins neighboring modules into smooth runs; Dots draws each module as a separate circle. Timing and alignment marks stay square so scanners can still lock on. |
| Corner style | **Square** (default), Rounded, Circle | The three large finder patterns (the "eyes" in the corners). |
| Frame shape | **None** (default), Circle, Rounded square, Diamond, Triangle, Hexagon, Star, Heart, Castle, Cloud, Rectangle, Octagon, House, Sun, Moon, Shield, Speech bubble, Map pin, Gear, Paw print, Ticket | Cuts the whole image to a shape. The real code stays square inside it; the rest of the shape is the frame. |
| Frame fill | **Dots** (default), Solid | Dots fills the frame with a decorative dot pattern. Solid paints the whole shape in the frame color, with a plain background-colored window around the code (the code plus its 2-module gap). Shown only while a frame is on. |
| Frame color | **Match code** (default), Lighter tint, Custom | Color of the frame. Lighter tint mixes the code color 55% toward the background, so the frame reads softer than the code. Shown only while a frame is on. |

The downloaded PNG is exactly what the preview shows. Every combination is covered by a test that decodes the rendered image back to the input text.

### How frames work

- The QR code itself is never reshaped. It sits inside the shape with a clear gap of 2 modules on every side, and no decoration is drawn in that gap, so scanners still see the code's edges.
- The code is placed at the largest size that fits fully inside the shape together with its gap, so it sits in the shape's main body (the body of the house, the round part of the map pin, the main pad of the paw print). Parts that are separate from the body, like the sun's rays or the paw's toes, are drawn solid in both fills.
- With Dots, decorative dots use the current dot shape and fill the rest of the shape. Their pattern comes from a fixed seed made from the text and settings (not the fill), so the same input always gives the same image, and a different text gives a different pattern. Modules on the shape's edge are always drawn, so the outline stays crisp. Solid has no pattern and its edges are anti-aliased.
- Circle through Heart keep a square image. The newer shapes use an image that fits the shape's own proportions, so Rectangle, Ticket, and Cloud give wide PNGs.
- Shape notes: the ticket's tear line is a cleared strip with notches on its ends and on the short sides; the moon is a fat crescent with the code in its thick lower-left part, so the code is a smaller share of the image than in other shapes; the gear has 10 teeth.
- Framed images are larger than plain ones (the shape has to fit around the code). Very large ones are capped at 4096 pixels per side by using a smaller module size; the app shows "reduced to fit" when that happens.
- While a frame is on, error correction is at least **Quartile**. A lower choice is kept and comes back when the frame is set to None.

### Scanning tips

- Keep high contrast. The app warns (without blocking) when code and background are below 4.5:1. Light-on-dark, like the Inverse preset, is fine as long as the contrast holds.
- Use error correction **Medium or higher** with Rounded or Dots shapes. It gives scanners more room for the softer edges.
- Keep the quiet zone (the plain border) when you place the code, and test-scan a printed copy at the size you will use.
- With a frame, print a bit larger than a plain code would need: the code is only part of the image. Avoid cropping into the shape, and keep the decoration in Match code or Lighter tint unless your custom color is clearly different from the background.
- Framed codes are tested for every shape, in both fills, at the smallest and largest module sizes, with a second decoder (ZXing), and after halving and slightly blurring the image.

## Requirements

- Node.js 22
- npm

## Run

```bash
npm install
npm run dev
```

Open the local preview, enter a link, and download the PNG.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 8080 |
| `npm test` | All unit tests (script tests, then the TypeScript tests in `src/lib`) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm run build` | Default production build (Vercel/Nitro output in `.vercel/output`) |
| `npm run build:pages` | Static build for GitHub Pages, served under `/QR-Zone/`, written to `dist/client` |
| `npm run test:e2e` | Browser smoke test of the static build (run `npm run build:pages` first; needs Chromium from `npx playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to a local Chrome) |
| `npm run test:golden:update` | Regenerate the golden render hashes (see below) |

### Golden renders

`src/lib/qr/golden.test.ts` renders one fixed, seeded image per frame shape (plus one per shape with Solid fill) and compares its SHA-256 with `src/lib/qr/golden-hashes.json`. Any pixel change fails `npm test`, including changes from the renderer, the frame layout, the decorative pattern, or a `qrcode` upgrade.

When a change to the image is intended, run `npm run test:golden:update`, check the new look in the app, and commit the updated JSON in the same commit as the change. Don't update the hashes to silence an unexpected failure.

## Deploy (GitHub Pages)

`.github/workflows/pages.yml` runs `npm run build:pages` on every push to `main` (or manually from the Actions tab) and publishes `dist/client` to GitHub Pages. In the repository settings, Pages must use **GitHub Actions** as its source.

To check a Pages build locally, serve `dist/client` under a `/QR-Zone/` path, for example:

```bash
npm run build:pages
mkdir -p /tmp/pages && rm -rf /tmp/pages/QR-Zone && cp -r dist/client /tmp/pages/QR-Zone
npx serve /tmp/pages   # or any static server; then open /QR-Zone/
```

### Source snapshot

`archive/QR-Zone.zip` is a zip of the project source, kept in the repository only. It is not part of the site or of either build. Refresh it by hand with `sh scripts/make-project-zip.sh` (it packs the committed tree at `HEAD`) and commit the result.

## History

This project was called **Quiet Zone** and lived at `El-Jeffe81/QR_Generator`. GitHub redirects the old repository URL, but the old Pages address (`https://el-jeffe81.github.io/QR_Generator/`) no longer works; use https://el-jeffe81.github.io/QR-Zone/.
