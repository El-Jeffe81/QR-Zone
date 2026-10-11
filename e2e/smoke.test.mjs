// Browser smoke test of the static Pages build (run `npm run build:pages`
// first): load the app under /QR-Zone/, type text, pick a frame, and check
// that both the preview and the downloaded PNG decode to the text.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import jsQR from "jsqr";
import { chromium } from "playwright";
import { serveStatic } from "./static-server.mjs";

const ROOT = "dist/client";
const TEXT = "https://el-jeffe81.github.io/QR-Zone/?from=smoke";

/** Decodes a PNG data URL inside the page and returns its RGBA pixels. */
async function pixelsOf(page, dataUrl) {
  const { width, height, data } = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const context = canvas.getContext("2d");
    context.drawImage(img, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    return { width: canvas.width, height: canvas.height, data: Array.from(pixels.data) };
  }, dataUrl);
  return { width, height, data: Uint8ClampedArray.from(data) };
}

function decode({ width, height, data }) {
  return jsQR(data, width, height)?.data ?? null;
}

describe("static Pages build smoke test", () => {
  let server;
  let browser;
  let page;
  const problems = [];

  before(async () => {
    assert.ok(existsSync(`${ROOT}/index.html`), "run `npm run build:pages` first");
    server = await serveStatic(ROOT);
    browser = await chromium.launch({
      // Lets a machine with a system Chrome run this without a Playwright download.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    });
    const context = await browser.newContext({ acceptDownloads: true });
    page = await context.newPage();
    page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(`console error: ${message.text()}`);
    });
    page.on("response", (response) => {
      if (response.status() >= 400) problems.push(`HTTP ${response.status()} ${response.url()}`);
    });
  });

  after(async () => {
    await browser?.close();
    await server?.close();
  });

  it("loads under /QR-Zone/, frames the code, and both preview and download decode", async () => {
    await page.goto(server.url, { waitUntil: "networkidle" });
    assert.match(await page.title(), /QR Zone/);

    const input = page.getByLabel("URL or text");
    await input.fill("");
    await input.pressSequentially(TEXT);

    const frames = page.getByRole("radiogroup", { name: "Frame shape" });
    await frames.getByRole("radio", { name: "Heart", exact: true }).check();
    await page.getByText("Frames use at least Quartile").waitFor();

    const preview = page.locator('img[src^="data:image/png"]');
    await preview.waitFor();
    const previewSrc = await preview.getAttribute("src");
    assert.equal(decode(await pixelsOf(page, previewSrc)), TEXT, "preview does not decode");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download PNG" }).click(),
    ]);
    assert.match(download.suggestedFilename(), /\.png$/);
    const file = readFileSync(await download.path());
    const downloaded = `data:image/png;base64,${file.toString("base64")}`;
    assert.equal(decode(await pixelsOf(page, downloaded)), TEXT, "download does not decode");
    assert.equal(downloaded, previewSrc, "download differs from the preview");

    assert.deepEqual(problems, []);
  });
});
