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
| Frame shape | **None** (default), Circle, Rounded square, Diamond, Triangle, Hexagon, Star, Heart | Cuts the whole image to a shape. The real code stays square in the middle; the rest of the shape is filled with decorative dots. |
| Frame color | **Match code** (default), Lighter tint, Custom | Color of the decorative dots. Lighter tint mixes the code color 55% toward the background, so the decoration reads softer than the code. Shown only while a frame is on. |

The downloaded PNG is exactly what the preview shows. Every combination is covered by a test that decodes the rendered image back to the input text.

### How frames work

- The QR code itself is never reshaped. It sits inside the shape with a clear gap of 2 modules on every side, and no decoration is drawn in that gap, so scanners still see the code's edges.
- Decorative dots use the current dot shape and fill the rest of the shape. Their pattern comes from a fixed seed made from the text and settings, so the same input always gives the same image, and a different text gives a different pattern.
- Framed images are larger than plain ones (the shape has to fit around the code). Very large ones are capped at 4096 pixels per side by using a smaller module size; the app shows "reduced to fit" when that happens.
- While a frame is on, error correction is at least **Quartile**. A lower choice is kept and comes back when the frame is set to None.

### Scanning tips

- Keep high contrast. The app warns (without blocking) when code and background are below 4.5:1. Light-on-dark, like the Inverse preset, is fine as long as the contrast holds.
- Use error correction **Medium or higher** with Rounded or Dots shapes. It gives scanners more room for the softer edges.
- Keep the quiet zone (the plain border) when you place the code, and test-scan a printed copy at the size you will use.
- With a frame, print a bit larger than a plain code would need: the code is only part of the image. Avoid cropping into the shape, and keep the decoration in Match code or Lighter tint unless your custom color is clearly different from the background.
- Framed codes are tested at the smallest and largest module sizes, with a second decoder (ZXing), and after halving and slightly blurring the image.

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

## Deploy (GitHub Pages)

`.github/workflows/pages.yml` runs `npm run build:pages` on every push to `main` (or manually from the Actions tab) and publishes `dist/client` to GitHub Pages. In the repository settings, Pages must use **GitHub Actions** as its source.

To check a Pages build locally, serve `dist/client` under a `/QR-Zone/` path, for example:

```bash
npm run build:pages
mkdir -p /tmp/pages && rm -rf /tmp/pages/QR-Zone && cp -r dist/client /tmp/pages/QR-Zone
npx serve /tmp/pages   # or any static server; then open /QR-Zone/
```

## History

This project was called **Quiet Zone** and lived at `El-Jeffe81/QR_Generator`. GitHub redirects the old repository URL, but the old Pages address (`https://el-jeffe81.github.io/QR_Generator/`) no longer works; use https://el-jeffe81.github.io/QR-Zone/.
