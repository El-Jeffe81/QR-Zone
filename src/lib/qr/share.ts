/**
 * Everything the Share button hands to the browser, built from the same PNG
 * data URL the preview shows and Download saves. Nothing here talks to a
 * server: the system share sheet, mailto: and sms: links, and the clipboard
 * are all local to the device.
 */

/** Download (and share) file name for the encoded text. */
export function fileName(text: string): string {
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

const PNG_PREFIX = "data:image/png;base64,";

/** The exact bytes of a PNG data URL, which are the bytes Download saves. */
export function pngBytes(dataUrl: string): Uint8Array<ArrayBuffer> {
  if (!dataUrl.startsWith(PNG_PREFIX)) throw new Error("Not a PNG data URL.");
  const binary = atob(dataUrl.slice(PNG_PREFIX.length));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export type SharePayload = {
  /** The PNG as a file, named like the download. */
  file: File;
  /** The encoded text or URL, sent as the message. */
  text: string;
};

/** Files plus message text for `navigator.share`. */
export function sharePayload(dataUrl: string, text: string): SharePayload {
  const file = new File([pngBytes(dataUrl)], fileName(text), { type: "image/png" });
  return { file, text: text.trim() };
}

/** Line breaks as CRLF, which mail and SMS clients expect in a link body. */
function crlf(text: string) {
  return text.replace(/\r?\n/g, "\r\n");
}

export const EMAIL_SUBJECT = "QR code";

/**
 * A mailto: link with subject "QR code" and the text as the body. mailto:
 * can't carry attachments, so the app tells people to attach the downloaded
 * PNG themselves.
 */
export function mailtoHref(text: string): string {
  const subject = encodeURIComponent(EMAIL_SUBJECT);
  const body = encodeURIComponent(crlf(text.trim()));
  return `mailto:?subject=${subject}&body=${body}`;
}

/**
 * An sms: link with the text as the body. `sms:?&body=` is the form both iOS
 * and Android messaging apps read.
 */
export function smsHref(text: string): string {
  return `sms:?&body=${encodeURIComponent(crlf(text.trim()))}`;
}

type ShareNavigator = Pick<Navigator, "canShare" | "share">;

/** True when this browser can share the PNG itself through the system sheet. */
export function canShareFile(nav: Partial<ShareNavigator> | undefined, payload: SharePayload) {
  if (!nav || typeof nav.share !== "function" || typeof nav.canShare !== "function") return false;
  try {
    return nav.canShare({ files: [payload.file], text: payload.text });
  } catch {
    return false;
  }
}

type ClipboardGlobals = {
  // A constructor (function), optionally with the static `supports` check.
  ClipboardItem?: unknown;
  navigator?: { clipboard?: { write?: unknown } };
};

/** True when the clipboard can take a PNG image. */
export function canCopyImage(scope: ClipboardGlobals = globalThis as ClipboardGlobals) {
  if (typeof scope.ClipboardItem !== "function") return false;
  const item = scope.ClipboardItem as { supports?: (type: string) => boolean };
  if (typeof scope.navigator?.clipboard?.write !== "function") return false;
  return typeof item.supports === "function" ? item.supports("image/png") : true;
}
