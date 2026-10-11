import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EMAIL_SUBJECT,
  canCopyImage,
  canShareFile,
  fileName,
  mailtoHref,
  pngBytes,
  sharePayload,
  smsHref,
} from "./share.ts";

/** A real 1x1 PNG. */
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
/** Every byte value, so decoding can't silently drop or remap any. */
const ALL_BYTES = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
const ALL_BYTES_URL = `data:image/png;base64,${ALL_BYTES.toString("base64")}`;

/** What the Download link saves: the base64 payload of the data URL. */
function downloadedBytes(dataUrl: string) {
  return new Uint8Array(Buffer.from(dataUrl.split(",")[1], "base64"));
}

/** Reads a mailto:/sms: query back the way a mail or SMS app would. */
function query(href: string) {
  return new URLSearchParams(href.slice(href.indexOf("?") + 1).replace(/^&/, ""));
}

describe("share payload", () => {
  it("carries exactly the bytes Download saves", async () => {
    for (const url of [PIXEL, ALL_BYTES_URL]) {
      assert.deepEqual(pngBytes(url), downloadedBytes(url));
      const { file } = sharePayload(url, "https://example.com/");
      assert.deepEqual(new Uint8Array(await file.arrayBuffer()), downloadedBytes(url));
      assert.equal(file.size, downloadedBytes(url).length);
    }
  });

  it("names the file like the download and types it as PNG", () => {
    const cases: [string, string][] = [
      ["https://www.example.com/a?b=1", "qr-example.com.png"],
      ["  Hello, World!  ", "qr-hello-world.png"],
      ["", "qr-code.png"],
    ];
    for (const [text, name] of cases) {
      assert.equal(fileName(text), name);
      const { file } = sharePayload(PIXEL, text);
      assert.equal(file.name, name);
      assert.equal(file.type, "image/png");
    }
  });

  it("sends the trimmed text as the message", () => {
    assert.equal(
      sharePayload(PIXEL, "  https://example.com/?q=1 \n").text,
      "https://example.com/?q=1",
    );
  });

  it("rejects anything but a PNG data URL", () => {
    assert.throws(() => pngBytes("data:image/jpeg;base64,AAAA"));
    assert.throws(() => pngBytes("https://example.com/qr.png"));
  });
});

const TRICKY = [
  "https://example.com/path?a=1&b=2#top",
  "Café ☕ — 日本語 👋",
  "50% off? Yes & no #deal + more",
  "line one\nline two",
];

describe("mailto and sms links", () => {
  it("mailto: has subject 'QR code' and the text as the body, round-tripping exactly", () => {
    for (const text of TRICKY) {
      const href = mailtoHref(text);
      assert.match(href, /^mailto:\?subject=QR%20code&body=/);
      const params = query(href);
      assert.equal(params.get("subject"), EMAIL_SUBJECT);
      assert.equal(params.get("body"), text.replace(/\n/g, "\r\n"));
      assert.deepEqual([...params.keys()], ["subject", "body"], `extra params in ${href}`);
    }
  });

  it("sms: has the text as the body, round-tripping exactly", () => {
    for (const text of TRICKY) {
      const href = smsHref(text);
      assert.match(href, /^sms:\?&body=/);
      const params = query(href);
      assert.equal(params.get("body"), text.replace(/\n/g, "\r\n"));
      assert.deepEqual([...params.keys()], ["body"], `extra params in ${href}`);
    }
  });

  it("escapes the characters that would break the link", () => {
    const body = mailtoHref("a&b?c#d e+f%").split("body=")[1];
    assert.equal(body, "a%26b%3Fc%23d%20e%2Bf%25");
    assert.equal(smsHref("a&b?c#d").split("body=")[1], "a%26b%3Fc%23d");
    assert.equal(smsHref("é").split("body=")[1], "%C3%A9");
    assert.ok(!/[\s#&?]/.test(body), body);
  });
});

describe("feature checks", () => {
  const payload = sharePayload(PIXEL, "https://example.com/");

  it("uses the share sheet only when it accepts files", () => {
    let seen: ShareData | undefined;
    const yes = {
      share: async () => {},
      canShare: (data?: ShareData) => {
        seen = data;
        return true;
      },
    };
    assert.equal(canShareFile(yes, payload), true);
    assert.deepEqual(seen, { files: [payload.file], text: payload.text });
    assert.equal(canShareFile({ share: async () => {}, canShare: () => false }, payload), false);
    assert.equal(canShareFile({ share: async () => {} }, payload), false);
    assert.equal(canShareFile({}, payload), false);
    assert.equal(canShareFile(undefined, payload), false);
    const throws = {
      share: async () => {},
      canShare: () => {
        throw new TypeError("no");
      },
    };
    assert.equal(canShareFile(throws, payload), false);
  });

  it("offers Copy image only when the clipboard takes PNGs", () => {
    const write = async () => {};
    class Item {}
    class PngItem {
      static supports = (type: string) => type === "image/png";
    }
    class NoPngItem {
      static supports = () => false;
    }
    assert.equal(canCopyImage({ ClipboardItem: Item, navigator: { clipboard: { write } } }), true);
    assert.equal(
      canCopyImage({ ClipboardItem: PngItem, navigator: { clipboard: { write } } }),
      true,
    );
    assert.equal(
      canCopyImage({ ClipboardItem: NoPngItem, navigator: { clipboard: { write } } }),
      false,
    );
    assert.equal(canCopyImage({ navigator: { clipboard: { write } } }), false);
    assert.equal(canCopyImage({ ClipboardItem: Item, navigator: { clipboard: {} } }), false);
    assert.equal(canCopyImage({ ClipboardItem: Item }), false);
  });
});
