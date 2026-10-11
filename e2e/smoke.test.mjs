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
/** The layout is meant to fit a 1280×800 screen without scrolling. */
const VIEWPORT = { width: 1280, height: 800 };

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
    const context = await browser.newContext({ acceptDownloads: true, viewport: VIEWPORT });
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

  it("does not publish the project zip", async () => {
    assert.ok(!existsSync(`${ROOT}/QR-Zone.zip`), "QR-Zone.zip is in the Pages build");
    const response = await page.request.get(`${server.url}QR-Zone.zip`);
    assert.equal(response.status(), 404);
    assert.equal(await page.locator('a[href$=".zip"]').count(), 0, "page still links a zip");
  });

  it("fits a 1280×800 screen with a frame on, without page scroll", async () => {
    const { scrollHeight, innerHeight, scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    assert.equal(innerHeight, VIEWPORT.height);
    assert.ok(scrollHeight <= innerHeight, `page is ${scrollHeight}px tall in ${innerHeight}px`);
    assert.ok(scrollWidth <= innerWidth, `page is ${scrollWidth}px wide in ${innerWidth}px`);
  });

  it("opens the large view with Close focused, shows a code that decodes, and returns focus", async () => {
    const focusedName = () =>
      page.evaluate(() => {
        const active = document.activeElement;
        return active?.getAttribute("aria-label") ?? active?.textContent?.trim() ?? null;
      });
    const dialog = page.getByRole("dialog", { name: "QR code, large view" });
    const smallWidth = (await page.locator("main img.qr-preview").first().boundingBox()).width;

    // Open with the expand button next to Download; close with Close.
    await page.getByRole("button", { name: "Expand preview" }).click();
    await dialog.waitFor();
    assert.equal(await focusedName(), "Close");
    const large = dialog.getByRole("img");
    const box = await large.boundingBox();
    assert.ok(box.width > smallWidth, `large view ${box.width}px vs preview ${smallWidth}px`);
    // Decode what is actually on screen, at its displayed size.
    const shot = await large.screenshot();
    const shown = `data:image/png;base64,${shot.toString("base64")}`;
    assert.equal(decode(await pixelsOf(page, shown)), TEXT, "large view does not decode");
    await dialog.getByRole("button", { name: "Close" }).click();
    await dialog.waitFor({ state: "detached" });
    assert.equal(await focusedName(), "Expand preview");

    // Open by clicking the preview itself; Escape closes and focus returns to it.
    await page.getByRole("button", { name: "Open large preview" }).click();
    await dialog.waitFor();
    assert.equal(await focusedName(), "Close");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(await focusedName(), "Open large preview");

    assert.deepEqual(problems, []);
  });

  it("an added shape with solid fill: Castle + Solid decodes in preview and download", async () => {
    const preview = page.getByRole("button", { name: "Open large preview" }).locator("img");
    const before = await preview.getAttribute("src");
    const frames = page.getByRole("radiogroup", { name: "Frame shape" });
    await frames.getByRole("radio", { name: "Castle", exact: true }).check();
    await page
      .getByRole("radiogroup", { name: "Frame fill" })
      .getByRole("radio", { name: "Solid", exact: true })
      .check();
    await page.waitForFunction(
      (old) =>
        document
          .querySelector("button[aria-label='Open large preview'] img")
          ?.getAttribute("src") !== old,
      before,
    );
    const previewSrc = await preview.getAttribute("src");
    assert.equal(decode(await pixelsOf(page, previewSrc)), TEXT, "Castle preview does not decode");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download PNG" }).click(),
    ]);
    const file = readFileSync(await download.path());
    const downloaded = `data:image/png;base64,${file.toString("base64")}`;
    assert.equal(decode(await pixelsOf(page, downloaded)), TEXT, "Castle download does not decode");
    assert.equal(downloaded, previewSrc, "download differs from the preview");
    assert.deepEqual(problems, []);
  });

  /** A fresh page with its own context, set up before the app's scripts run. */
  async function freshPage(init, contextOptions = {}) {
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: VIEWPORT,
      ...contextOptions,
    });
    const fresh = await context.newPage();
    const errors = [];
    fresh.on("pageerror", (error) => errors.push(`page error: ${error.message}`));
    fresh.on("console", (message) => {
      if (message.type() === "error") errors.push(`console error: ${message.text()}`);
    });
    await fresh.addInitScript(init);
    await fresh.goto(server.url, { waitUntil: "networkidle" });
    return { fresh, context, errors };
  }

  it("Share opens the system share sheet with the PNG (same bytes and name as Download) and the text", async () => {
    const { fresh, context, errors } = await freshPage(() => {
      const define = (name, value) =>
        Object.defineProperty(navigator, name, { value, configurable: true });
      window.__canShareCalls = 0;
      define("canShare", (data) => {
        window.__canShareCalls += 1;
        return Boolean(data?.files?.length);
      });
      define("share", async (data) => {
        const files = [];
        for (const file of data.files ?? []) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          let binary = "";
          for (const byte of bytes) binary += String.fromCharCode(byte);
          files.push({ name: file.name, type: file.type, base64: btoa(binary) });
        }
        window.__shared = { text: data.text, files };
      });
    });
    const input = fresh.getByLabel("URL or text");
    await input.fill(TEXT);
    const preview = fresh.getByRole("button", { name: "Open large preview" }).locator("img");
    await preview.waitFor();
    const share = fresh.getByRole("button", { name: "Share", exact: true });
    assert.equal(await share.getAttribute("aria-haspopup"), null, "sheet mode is not a menu");
    await share.click();
    await fresh.waitForFunction(() => window.__shared);
    const shared = await fresh.evaluate(() => window.__shared);
    assert.equal(shared.text, TEXT);
    assert.equal(shared.files.length, 1);
    assert.equal(shared.files[0].type, "image/png");

    const [download] = await Promise.all([
      fresh.waitForEvent("download"),
      fresh.getByRole("button", { name: "Download PNG" }).click(),
    ]);
    assert.equal(shared.files[0].name, download.suggestedFilename());
    const downloaded = readFileSync(await download.path()).toString("base64");
    assert.equal(shared.files[0].base64, downloaded, "shared PNG differs from the download");
    const previewSrc = await preview.getAttribute("src");
    assert.equal(`data:image/png;base64,${shared.files[0].base64}`, previewSrc);
    assert.equal(decode(await pixelsOf(fresh, previewSrc)), TEXT);
    assert.equal(await fresh.getByRole("menu").count(), 0, "fallback menu opened too");
    assert.deepEqual(errors, []);
    await context.close();
  });

  it("without file sharing, Share opens an accessible menu with mail, text, and copy actions", async () => {
    const SHARE_TEXT = "Café & co? #1 ☕ https://example.com/?a=1&b=2#top";
    const { fresh, context, errors } = await freshPage(
      () => {
        for (const name of ["share", "canShare"]) {
          Object.defineProperty(navigator, name, { value: undefined, configurable: true });
        }
      },
      { permissions: ["clipboard-read", "clipboard-write"] },
    );
    const focusedName = () =>
      fresh.evaluate(() => {
        const active = document.activeElement;
        return active?.getAttribute("aria-label") ?? active?.textContent?.trim() ?? null;
      });
    await fresh.getByLabel("URL or text").fill(SHARE_TEXT);
    await fresh.getByRole("button", { name: "Open large preview" }).locator("img").waitFor();

    const share = fresh.getByRole("button", { name: "Share", exact: true });
    assert.equal(await share.getAttribute("aria-haspopup"), "menu");
    assert.equal(await share.getAttribute("aria-expanded"), "false");
    await share.click();
    const menu = fresh.getByRole("menu", { name: "Share" });
    await menu.waitFor();
    assert.equal(await share.getAttribute("aria-expanded"), "true");
    assert.equal(await focusedName(), "Email", "first item is focused on open");

    const encoded = encodeURIComponent(SHARE_TEXT);
    const email = menu.getByRole("menuitem", { name: "Email", exact: true });
    const sms = menu.getByRole("menuitem", { name: "Text message", exact: true });
    assert.equal(await email.getAttribute("href"), `mailto:?subject=QR%20code&body=${encoded}`);
    assert.equal(await sms.getAttribute("href"), `sms:?&body=${encoded}`);
    assert.match(await menu.textContent(), /can’t attach files/);
    assert.match(await menu.textContent(), /needs a texting app/);

    // Arrow keys move through the items; Escape closes and returns focus.
    await fresh.keyboard.press("ArrowDown");
    assert.equal(await focusedName(), "Text message");
    await fresh.keyboard.press("End");
    assert.equal(await focusedName(), "Copy text");
    await fresh.keyboard.press("ArrowDown");
    assert.equal(await focusedName(), "Email", "focus wraps around");
    await fresh.keyboard.press("Escape");
    await menu.waitFor({ state: "detached" });
    assert.equal(await focusedName(), "Share");
    assert.equal(await share.getAttribute("aria-expanded"), "false");

    // Copy text: confirmation, and the clipboard holds the text.
    await share.click();
    await menu.getByRole("menuitem", { name: "Copy text" }).click();
    await fresh.getByRole("status").filter({ hasText: "Text copied." }).waitFor();
    assert.equal(await fresh.evaluate(() => navigator.clipboard.readText()), SHARE_TEXT);
    assert.equal(await focusedName(), "Share");

    // Copy image, where the clipboard takes PNGs (it does in Chromium).
    await share.click();
    const copyImage = menu.getByRole("menuitem", { name: "Copy image" });
    if (await copyImage.count()) {
      await copyImage.click();
      await fresh.getByRole("status").filter({ hasText: "Image copied." }).waitFor();
      const types = await fresh.evaluate(async () =>
        (await navigator.clipboard.read()).flatMap((item) => item.types),
      );
      assert.ok(types.includes("image/png"), `clipboard has ${types}`);
    } else {
      await fresh.keyboard.press("Escape");
    }

    // A click outside closes the menu.
    await share.click();
    await menu.waitFor();
    await fresh.getByLabel("URL or text").click();
    await menu.waitFor({ state: "detached" });
    assert.deepEqual(errors, []);
    await context.close();
  });

  it("shows the selected error correction level's description, and uses it as each button's tooltip", async () => {
    const LEVEL_TEXT = {
      Low: "Recovers about 7% damage. Simplest, biggest squares. Best viewed on a screen.",
      Medium: "Recovers about 15%. A good balance for screens and standard printing.",
      Quartile: "Recovers about 25%. Used automatically with frames. Good for printed handouts.",
      High: "Recovers about 30%. Densest code. Survives smudges, folds, weather, or partial covering.",
    };
    const { fresh, context, errors } = await freshPage(() => {});
    const group = fresh.getByRole("radiogroup", { name: "Error correction" });
    const shown = fresh.locator("[data-ecc-description]");
    for (const [name, text] of Object.entries(LEVEL_TEXT)) {
      const radio = group.getByRole("radio", { name, exact: true });
      await radio.check();
      assert.equal((await shown.textContent()).trim(), text, `${name} description`);
      assert.ok(await shown.isVisible());
      const label = radio.locator("xpath=..");
      assert.equal(await label.getAttribute("title"), text, `${name} tooltip`);
      const description = await radio.evaluate((input) =>
        document.getElementById(input.getAttribute("aria-describedby"))?.textContent?.trim(),
      );
      assert.equal(description, text, `${name} accessible description`);
    }
    assert.deepEqual(errors, []);
    await context.close();
  });
});
