import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  appNameFromHost,
  createHeadInjector,
  studioXCreatorHeadTags,
  injectStudioPwaHead,
  isDocumentPath,
  isInstallQuery,
  publicAppHost,
  renderWebManifest,
  resolveOgCardAsset,
  snapshotOgIdentity,
  stripInstallParams,
} from "./studio-pwa-shared.mjs";
import { renderInstallPage } from "./studio-pwa-plugin.mjs";

const TEMPLATE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("injects before </head>", () => {
  const out = injectStudioPwaHead("<html><head><title>x</title></head><body></body></html>");
  assert.match(out, /rel="manifest"/);
  assert.match(out, /apple-touch-icon/);
  assert.match(out, /studio-app-builder\/extensions\.js/);
  assert.ok(out.indexOf("manifest") < out.indexOf("</head>"));
});

test("injects the extensions script without a project id", () => {
  const out = injectStudioPwaHead("<html><head></head></html>", {
    appName: "Demo",
    projectId: "",
  });
  assert.match(out, /src="https:\/\/studio\.example\/studio-app-builder\/extensions\.js" defer/);
  assert.doesNotMatch(out, /studio-project-id/);
  assert.doesNotMatch(out, /data-project-id/);
  assert.doesNotMatch(out, /property="studio:app_id"/);
});

test("injects project id on the script and meta when provided", () => {
  const out = injectStudioPwaHead("<html><head></head></html>", {
    appName: "Demo",
    projectId: "proj-123",
  });
  assert.match(out, /name="studio-project-id" content="proj-123"/);
  assert.match(out, /data-project-id="proj-123"/);
  assert.match(out, /property="studio:app_id" content="proj-123"/);
});

test("does not duplicate studio:app_id", () => {
  const ctx = { appName: "Demo", projectId: "proj-123" };
  const once = injectStudioPwaHead("<html><head></head></html>", ctx);
  const twice = injectStudioPwaHead(once, ctx);
  assert.equal(once, twice);
  assert.equal(twice.split('property="studio:app_id"').length - 1, 1);
});

test("omits x:creator tags without both creator values", () => {
  assert.deepEqual(studioXCreatorHeadTags("", "42"), []);
  assert.deepEqual(studioXCreatorHeadTags("@alice", ""), []);
  const out = injectStudioPwaHead("<html><head></head></html>", {
    appName: "Demo",
    projectId: "",
    creator: "@alice",
    creatorId: "",
  });
  assert.doesNotMatch(out, /property="x:creator"/);
});

test("injects x:creator tags when both creator values are set", () => {
  const out = injectStudioPwaHead("<html><head></head></html>", {
    appName: "Demo",
    projectId: "",
    creator: "@alice",
    creatorId: "42",
  });
  assert.match(out, /property="x:creator" content="@alice"/);
  assert.match(out, /property="x:creator:id" content="42"/);
});

test("escapes x:creator values", () => {
  const tags = studioXCreatorHeadTags('"><script>', '1" onclick="alert(1)');
  assert.equal(
    tags[0],
    '<meta property="x:creator" content="&quot;&gt;&lt;script&gt;">',
  );
  assert.equal(
    tags[1],
    '<meta property="x:creator:id" content="1&quot; onclick=&quot;alert(1)">',
  );
});

test("does not duplicate x:creator tags", () => {
  const ctx = { appName: "Demo", projectId: "", creator: "@alice", creatorId: "42" };
  const once = injectStudioPwaHead("<html><head></head></html>", ctx);
  const twice = injectStudioPwaHead(once, ctx);
  assert.equal(once, twice);
  assert.equal(twice.split('property="x:creator" content=').length - 1, 1);
  assert.equal(twice.split('property="x:creator:id"').length - 1, 1);
});

test("platform chrome overwrites share-card metas and always sets og:title", () => {
  const html =
    '<html><head><title>Hello World</title><meta property="og:title" content="Old"><meta name="twitter:card" content="summary"></head></html>';
  const out = injectStudioPwaHead(html, { appName: "Wild Race" });
  assert.match(out, /name="twitter:card" content="summary_large_image"/);
  assert.match(out, /property="og:title" content="Hello World"/);
  assert.doesNotMatch(out, /content="Old"/);
  assert.doesNotMatch(out, /content="summary"/);
  assert.equal(out.split('name="twitter:card"').length - 1, 1);
  assert.equal(out.split('property="og:title"').length - 1, 1);
  assert.doesNotMatch(out, /property="og:image"/);
});

test("does not duplicate twitter:card or og:title", () => {
  const once = injectStudioPwaHead("<html><head><title>Hello World</title></head></html>");
  const twice = injectStudioPwaHead(once);
  assert.equal(once, twice);
  assert.equal(twice.split('name="twitter:card"').length - 1, 1);
  assert.equal(twice.split('property="og:title"').length - 1, 1);
});

test("a baked site.image is treated as a custom card", () => {
  const out = injectStudioPwaHead("<html><head></head></html>", {
    host: "wild-race.studio.example",
    cwd: mkdtempSync(join(tmpdir(), "studio-og-image-only-")),
    site: { title: "Wild Race", image: "/og.jpg" },
  });
  assert.match(out, /property="og:image" content="https:\/\/wild-race\.studio\.example\/og\.jpg"/);
  assert.doesNotMatch(out, /og\.studio\.example/);
});

test("baked identity does not need a workspace filesystem", () => {
  const empty = mkdtempSync(join(tmpdir(), "studio-og-empty-"));
  const out = injectStudioPwaHead("<html><head></head></html>", {
    host: "wild-race.studio.example",
    cwd: empty,
    site: { title: "Pixel Nova", type: "x:game", card: "custom" },
  });
  assert.match(out, /property="og:title" content="Pixel Nova"/);
  assert.match(out, /property="og:type" content="x:game"/);
  assert.match(out, /property="og:image" content="https:\/\/wild-race\.studio\.example\/og\.jpg"/);
  assert.doesNotMatch(out, /og\.studio\.example/);
});

test("a public card file wins over a baked site without card=custom", () => {
  // Deploy middleware always passes a baked `site`. If that snapshot missed
  // the file, public/og.jpg must still beat the og.studio.example placeholder.
  const root = mkdtempSync(join(tmpdir(), "studio-og-card-"));
  mkdirSync(join(root, "public"));
  writeFileSync(join(root, "public/og.jpg"), "x");
  const out = injectStudioPwaHead("<html><head></head></html>", {
    host: "wild-race.studio.example",
    cwd: root,
    site: {},
  });
  assert.match(out, /property="og:image" content="https:\/\/wild-race\.studio\.example\/og\.jpg"/);
  assert.doesNotMatch(out, /og\.studio\.example/);
});

test("public/og.png wins when jpg is absent", () => {
  const root = mkdtempSync(join(tmpdir(), "studio-og-png-"));
  mkdirSync(join(root, "public"));
  writeFileSync(join(root, "public/og.png"), "x");
  const out = injectStudioPwaHead("<html><head></head></html>", {
    host: "wild-race.studio.example",
    cwd: root,
    site: { title: "Wild Race" },
  });
  assert.match(out, /property="og:image" content="https:\/\/wild-race\.studio\.example\/og\.png"/);
  assert.doesNotMatch(out, /og\.studio\.example/);
});

test("resolveOgCardAsset: disk file, then bake, then empty (placeholder)", () => {
  const empty = mkdtempSync(join(tmpdir(), "studio-og-none-"));
  assert.equal(resolveOgCardAsset({}, empty), "");
  assert.equal(resolveOgCardAsset({ title: "X" }, empty), "");

  const baked = resolveOgCardAsset({ card: "custom", image: "/og.jpg" }, empty);
  assert.equal(baked, "/og.jpg");

  const root = mkdtempSync(join(tmpdir(), "studio-og-disk-"));
  mkdirSync(join(root, "public"));
  writeFileSync(join(root, "public/og.jpg"), "x");
  assert.equal(resolveOgCardAsset({}, root), "/og.jpg");
  assert.equal(resolveOgCardAsset({ card: "custom", image: "/other.png" }, root), "/og.jpg");
});

test("snapshotOgIdentity stamps card=custom from a public card file", () => {
  const root = mkdtempSync(join(tmpdir(), "studio-og-snap-"));
  mkdirSync(join(root, "public"));
  writeFileSync(join(root, "public/og.jpg"), "x");
  const { site } = snapshotOgIdentity(root);
  assert.equal(site.card, "custom");
  assert.equal(site.image, "/og.jpg");
  assert.equal(site.banner, undefined);
});

test("snapshotOgIdentity stamps banner from public/x-banner.jpg", () => {
  const root = mkdtempSync(join(tmpdir(), "studio-og-banner-"));
  mkdirSync(join(root, "public"));
  writeFileSync(join(root, "public/x-banner.jpg"), "x");
  const { site } = snapshotOgIdentity(root);
  assert.equal(site.banner, "/x-banner.jpg");
});

test("emits x:game:image for a public host when site.banner is set", () => {
  const html = "<html><head><meta property=\"x:game:image\" content=\"old\"></head></html>";
  const out = injectStudioPwaHead(html, {
    host: "wild-race.studio.example",
    site: { title: "Wild Race", type: "x:game", card: "custom", banner: "/x-banner.jpg" },
  });
  assert.match(
    out,
    /property="x:game:image" content="https:\/\/wild-race\.studio\.example\/x-banner\.jpg"/,
  );
  assert.match(out, /property="x:game:image:width" content="1200"/);
  assert.match(out, /property="x:game:image:height" content="264"/);
  assert.doesNotMatch(out, /content="old"/);
  assert.equal(out.split('property="x:game:image"').length - 1, 1);
});

test("does not emit x:game:image without a public host or banner", () => {
  const noHost = injectStudioPwaHead("<html><head></head></html>", {
    site: { banner: "/x-banner.jpg" },
  });
  assert.doesNotMatch(noHost, /x:game:image/);
  const noBanner = injectStudioPwaHead("<html><head></head></html>", {
    host: "wild-race.studio.example",
    site: { type: "x:game", card: "custom" },
  });
  assert.doesNotMatch(noBanner, /x:game:image/);
});

test("site title QR Zone is a real name, not a sentinel", () => {
  const out = injectStudioPwaHead("<html><head></head></html>", {
    host: "wild-race.studio.example",
    site: { title: "QR Zone" },
  });
  assert.match(out, /property="og:title" content="QR Zone"/);
});

test("published studio.example slug is still a title fallback", () => {
  const out = injectStudioPwaHead("<html><head></head></html>", {
    host: "wild-race.studio.example",
  });
  assert.match(out, /property="og:title" content="Wild Race"/);
});

test("rejects Vercel system hosts as og:image origins", () => {
  assert.equal(publicAppHost("01a020b6-803a-71a2-bb47-e2bec57eb9a2-662k8x1l1-example-org.vercel.app"), "");
  assert.equal(publicAppHost("demo.vercel.app:443"), "");
  assert.equal(publicAppHost("vercel.app"), "");
  assert.equal(publicAppHost("wild-race.studio.example"), "wild-race.studio.example");
});

test("published VITE_PUBLIC_HOSTNAME wins over request Host for og:image", () => {
  const prev = process.env.VITE_PUBLIC_HOSTNAME;
  process.env.VITE_PUBLIC_HOSTNAME = "plum-plaza-reef-dream.studio.example";
  try {
    const vercelHost = injectStudioPwaHead("<html><head><title>RACK</title></head></html>", {
      host: "01a020b6-803a-71a2-bb47-e2bec57eb9a2-662k8x1l1-example-org.vercel.app",
      site: { title: "RACK", card: "custom" },
    });
    assert.match(
      vercelHost,
      /property="og:image" content="https:\/\/plum-plaza-reef-dream\.studio\.example\/og\.jpg"/,
    );
    assert.doesNotMatch(vercelHost, /vercel\.app/);

    const otherPublicHost = injectStudioPwaHead("<html><head><title>RACK</title></head></html>", {
      host: "custom.example.com",
      site: { title: "RACK", card: "custom" },
    });
    assert.match(
      otherPublicHost,
      /property="og:image" content="https:\/\/plum-plaza-reef-dream\.studio\.example\/og\.jpg"/,
    );
    assert.doesNotMatch(otherPublicHost, /custom\.example\.com/);
  } finally {
    if (prev === undefined) delete process.env.VITE_PUBLIC_HOSTNAME;
    else process.env.VITE_PUBLIC_HOSTNAME = prev;
  }
});

test("vercel Host without a public hostname emits no og:image", () => {
  const prev = process.env.VITE_PUBLIC_HOSTNAME;
  delete process.env.VITE_PUBLIC_HOSTNAME;
  try {
    const out = injectStudioPwaHead("<html><head><title>RACK</title></head></html>", {
      host: "01a020b6-803a-71a2-bb47-e2bec57eb9a2-662k8x1l1-example-org.vercel.app",
      site: { title: "RACK", card: "custom" },
    });
    assert.doesNotMatch(out, /property="og:image"/);
    assert.doesNotMatch(out, /vercel\.app/);
  } finally {
    if (prev === undefined) delete process.env.VITE_PUBLIC_HOSTNAME;
    else process.env.VITE_PUBLIC_HOSTNAME = prev;
  }
});

test("emits og:image for a public host and prefers a custom card", () => {
  const placeholder = injectStudioPwaHead("<html><head></head></html>", {
    appName: "Wild Race",
    host: "wild-race.studio.example",
    site: { title: "Wild Race" },
  });
  assert.match(
    placeholder,
    /property="og:image" content="https:\/\/og\.studio\.example\/v1\/card\.png\?host=wild-race\.studio\.example&amp;title=Wild%20Race"/,
  );
  assert.match(placeholder, /property="og:image:width" content="1200"/);

  const custom = injectStudioPwaHead("<html><head></head></html>", {
    appName: "Wild Race",
    host: "wild-race.studio.example",
    site: { title: "Wild Race", card: "custom", type: "x:game" },
  });
  assert.match(custom, /property="og:image" content="https:\/\/wild-race\.studio\.example\/og\.jpg"/);
  assert.match(custom, /property="og:type" content="x:game"/);
});

test("placeholder og:image appends site.color when it is 6-digit hex", () => {
  const themed = injectStudioPwaHead("<html><head></head></html>", {
    host: "wild-race.studio.example",
    site: { title: "Wild Race", color: "#FF4D2E" },
  });
  assert.match(
    themed,
    /property="og:image" content="https:\/\/og\.studio\.example\/v1\/card\.png\?host=wild-race\.studio\.example&amp;title=Wild%20Race&amp;color=FF4D2E"/,
  );

  const invalid = injectStudioPwaHead("<html><head></head></html>", {
    host: "wild-race.studio.example",
    site: { title: "Wild Race", color: "red" },
  });
  assert.doesNotMatch(invalid, /color=/);

  const custom = injectStudioPwaHead("<html><head></head></html>", {
    host: "wild-race.studio.example",
    site: { title: "Wild Race", card: "custom", color: "FF4D2E" },
  });
  assert.doesNotMatch(custom, /color=/);
});

test("document title entities are not double-escaped on og:title", () => {
  const out = injectStudioPwaHead(
    "<html><head><title>Cats &amp; Dogs</title></head></html>",
  );
  assert.match(out, /property="og:title" content="Cats &amp; Dogs"/);
  assert.doesNotMatch(out, /Cats &amp;amp; Dogs/);
});

test("site.json title wins over the host slug", () => {
  const out = injectStudioPwaHead("<html><head></head></html>", {
    host: "wild-race.studio.example",
    site: { title: "Pixel Nova" },
  });
  assert.match(out, /property="og:title" content="Pixel Nova"/);
});

test("injects into documents with no head element", () => {
  const out = injectStudioPwaHead("<html><body>hi</body></html>", { appName: "Solo" });
  assert.match(out, /<head>/);
  assert.match(out, /property="og:title" content="Solo"/);
  assert.match(out, /<\/head>/);
});

test("streaming injector matches </HEAD> case-insensitively", () => {
  const injector = createHeadInjector({ appName: "Wild Race" });
  const chunks = [
    ...injector.push("<html><HEAD><title>x</title></HE"),
    ...injector.push("AD><body>hello</body></html>"),
  ];
  const out = Buffer.concat(chunks).toString("utf8");
  assert.match(out, /property="og:title" content="x"/);
  assert.match(out, /<body>hello<\/body>/);
});

test("does not duplicate the extensions script", () => {
  const ctx = { appName: "Demo", projectId: "proj-123" };
  const once = injectStudioPwaHead("<html><head></head></html>", ctx);
  const twice = injectStudioPwaHead(once, ctx);
  assert.equal(once, twice);
  assert.equal(twice.split("extensions.js").length - 1, 1);
});

test("is idempotent", () => {
  const once = injectStudioPwaHead("<html><head></head></html>");
  const twice = injectStudioPwaHead(once);
  assert.equal(once, twice);
});

test("uses the app name in the injected title tag", () => {
  const out = injectStudioPwaHead("<html><head></head></html>", { appName: "Wild Race" });
  assert.match(out, /apple-mobile-web-app-title" content="Wild Race"/);
});

test("streaming injector handles </head> split across chunks", () => {
  const injector = createHeadInjector({ appName: "Wild Race" });
  const chunks = [
    ...injector.push("<html><head><title>x</title></he"),
    ...injector.push("ad><body>hello</body></html>"),
  ];
  const out = Buffer.concat(chunks).toString("utf8");
  assert.match(out, /rel="manifest"/);
  assert.ok(out.indexOf("manifest") < out.indexOf("</head>"));
  assert.match(out, /<body>hello<\/body>/);
  assert.deepEqual(injector.flush(), []);
});

test("streaming injector passes post-head chunks through untouched", () => {
  const injector = createHeadInjector();
  injector.push("<html><head></head>");
  const [tail] = injector.push("<body>tail</body>");
  assert.equal(tail.toString("utf8"), "<body>tail</body>");
});

test("streaming injector falls back when no </head> is seen", () => {
  const injector = createHeadInjector();
  assert.deepEqual(injector.push("<html><head>"), []);
  const out = Buffer.concat(injector.flush()).toString("utf8");
  assert.match(out, /rel="manifest"/);
});

test("detects install query", () => {
  assert.equal(isInstallQuery("/?install=1&platform=ios"), true);
  assert.equal(isInstallQuery("/app?foo=1&install=true&platform=ios"), true);
  assert.equal(isInstallQuery("/?install=1"), false);
  assert.equal(isInstallQuery("/?install=1&platform=android"), false);
  assert.equal(isInstallQuery("/?install=0&platform=ios"), false);
  assert.equal(isInstallQuery("/"), false);
});

test("filters non-document paths", () => {
  assert.equal(isDocumentPath("/"), true);
  assert.equal(isDocumentPath("/app"), true);
  assert.equal(isDocumentPath("/api/thing"), false);
  assert.equal(isDocumentPath("/__studio/install/styles.css"), false);
  assert.equal(isDocumentPath("/logo.png"), false);
});

test("strips install params from the app link", () => {
  assert.equal(stripInstallParams("/?install=1&platform=ios"), "/");
  assert.equal(stripInstallParams("/app?install=1&platform=ios&tab=2"), "/app?tab=2");
});

test("names the install page from host slug", () => {
  assert.equal(appNameFromHost("localhost:8080"), "QR Zone");
  assert.equal(appNameFromHost("172.17.154.217:8080"), "QR Zone");
  assert.equal(appNameFromHost("wild-race.studio.example"), "Wild Race");
});

test("rejects hosts that are not plain slugs", () => {
  assert.equal(appNameFromHost("<script>alert(1)</script>"), "QR Zone");
  assert.equal(appNameFromHost('"><img src=x onerror=1>.studio.example'), "QR Zone");
});

test("renders install page markup", () => {
  const html = renderInstallPage("wild-race.studio.example", "/?install=1&platform=ios");
  assert.match(html, /Add Wild Race to your/);
  assert.match(html, /\/__studio\/install\/styles\.css/);
  assert.match(html, /href="\/"/);
  assert.equal(html.includes("{{APP_NAME}}"), false);
  assert.equal(html.includes("{{APP_URL}}"), false);
});

test("escapes host-derived values in the install page", () => {
  const html = renderInstallPage("<script>alert(1)</script>", "/?install=1&platform=ios");
  assert.equal(html.includes("<script>alert(1)</script>"), false);
});

test("renders the manifest with the per-app name", () => {
  const manifest = JSON.parse(renderWebManifest("wild-race.studio.example"));
  assert.equal(manifest.name, "Wild Race");
  assert.equal(manifest.short_name, "Wild Race");
  assert.equal(manifest.icons[0].src, "/__studio/icon-180.png");
});

// Tripwires: the deployed-app path only works if Nitro scans server/ — an
// accidental edit that drops serverDir or the middleware file would otherwise
// fail silently (published apps would just render the app for ?install=1).
test("vite config keeps the nitro serverDir wiring", () => {
  const viteConfig = readFileSync(join(TEMPLATE_ROOT, "vite.config.ts"), "utf8");
  assert.match(viteConfig, /serverDir:\s*"\.\/server"/);
  assert.match(viteConfig, /studioPwaPlugin\(\)/);
});

test("nitro middleware and its bundled assets exist", () => {
  const middleware = readFileSync(join(TEMPLATE_ROOT, "server/middleware/studio-pwa.ts"), "utf8");
  assert.match(middleware, /install-page\.html\?raw/);
  assert.match(middleware, /virtual:studio-og-identity/);
  readFileSync(join(TEMPLATE_ROOT, "scripts/install-page.html"));
  readFileSync(join(TEMPLATE_ROOT, "public/__studio/icon-180.png"));
  readFileSync(join(TEMPLATE_ROOT, "public/__studio/install/styles.css"));
});

test("vite plugin bakes og identity as a virtual module", () => {
  const plugin = readFileSync(join(TEMPLATE_ROOT, "scripts/studio-pwa-plugin.mjs"), "utf8");
  assert.match(plugin, /virtual:studio-og-identity/);
  assert.match(plugin, /snapshotOgIdentity/);
});

