# QR Zone

A QR code generator. Type a URL or any text and the code redraws immediately. Set foreground and background colors, dot shape, corner style, module size, and error correction, then download a PNG.

**Live:** https://el-jeffe81.github.io/QR-Zone/

Everything runs in the browser: the `qrcode` library encodes the text, the app draws the modules onto a canvas itself, and your last settings (including the shape choices) are kept in `localStorage` under `qr-zone:v1` (settings saved by older versions under `quiet-zone:v1` are carried over automatically). No account or server is needed.

## Shape options

| Option | Choices | What it changes |
| --- | --- | --- |
| Dot shape | **Square** (default), Rounded, Dots | The small data modules. Rounded softens outer corners and joins neighboring modules into smooth runs; Dots draws each module as a separate circle. Timing and alignment marks stay square so scanners can still lock on. |
| Corner style | **Square** (default), Rounded, Circle | The three large finder patterns (the "eyes" in the corners). |

The downloaded PNG is exactly what the preview shows. Every combination is covered by a test that decodes the rendered image back to the input text.

### Scanning tips

- Keep high contrast: dark marks on a light background scan best. The app warns when contrast drops below 3:1 or the colors are inverted.
- Use error correction **Medium or higher** with Rounded or Dots shapes. It gives scanners more room for the softer edges.
- Keep the quiet zone (the plain border) when you place the code, and test-scan a printed copy at the size you will use.

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
