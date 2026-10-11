// Minimal static file server for the GitHub Pages build: serves dist/client
// under /QR-Zone/, the same path the live site uses.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".zip": "application/zip",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

/** Starts the server on a free localhost port; resolves to { url, close }. */
export async function serveStatic(root, base = "/QR-Zone/") {
  const rootDir = resolve(root);
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (!path.startsWith(base)) {
      res.writeHead(404).end("not found");
      return;
    }
    let file = normalize(join(rootDir, path.slice(base.length)));
    if (!file.startsWith(rootDir)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    try {
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}${base}`,
    close: () => new Promise((done) => server.close(done)),
  };
}
