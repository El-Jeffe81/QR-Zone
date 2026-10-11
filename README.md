# Quiet Zone

A QR code generator. Type a URL or any text and the code redraws immediately. Set foreground and background colors, module size, and error correction, then download a PNG.

**Live:** https://el-jeffe81.github.io/QR_Generator/

Everything runs in the browser: codes are drawn with the `qrcode` library on a canvas, and your last settings are kept in `localStorage`. No account or server is needed.

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
| `npm run build:pages` | Static build for GitHub Pages, served under `/QR_Generator/`, written to `dist/client` |

## Deploy (GitHub Pages)

`.github/workflows/pages.yml` runs `npm run build:pages` on every push to `main` (or manually from the Actions tab) and publishes `dist/client` to GitHub Pages. In the repository settings, Pages must use **GitHub Actions** as its source.

To check a Pages build locally, serve `dist/client` under a `/QR_Generator/` path, for example:

```bash
npm run build:pages
mkdir -p /tmp/pages && rm -rf /tmp/pages/QR_Generator && cp -r dist/client /tmp/pages/QR_Generator
npx serve /tmp/pages   # or any static server; then open /QR_Generator/
```
