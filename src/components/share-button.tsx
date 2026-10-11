import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Copy, Image as ImageIcon, Mail, MessageSquare, Share2 } from "lucide-react";
import {
  canCopyImage,
  canShareFile,
  mailtoHref,
  pngBytes,
  sharePayload,
  smsHref,
} from "@/lib/qr/share";

/** Tiny PNG-typed file used only to ask the browser whether it shares files. */
function probePayload() {
  return {
    file: new File([new Uint8Array([0])], "qr-code.png", { type: "image/png" }),
    text: "QR code",
  };
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Older browsers: copy through a hidden, selected textarea.
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("copy failed");
}

/**
 * Share button for the current PNG. Where the browser can share files, it
 * opens the system share sheet with the PNG (same bytes and name as Download)
 * and the text. Elsewhere it opens a menu: Email, Text message, Copy image
 * (when the clipboard takes images) and Copy text. Everything stays on the
 * device; nothing is sent to a server.
 */
export function ShareButton({
  imageUrl,
  text,
  onNotify,
}: {
  imageUrl: string | null;
  text: string;
  onNotify: (message: string) => void;
}) {
  const [sheet, setSheet] = useState(false);
  const [imageCopy, setImageCopy] = useState(false);
  const [open, setOpen] = useState(false);
  // Opens below the button, or above it when there isn't room below.
  const [up, setUp] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const emailNoteId = useId();
  const smsNoteId = useId();

  useEffect(() => {
    setSheet(canShareFile(navigator, probePayload()));
    setImageCopy(canCopyImage());
  }, []);

  const items = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  useLayoutEffect(() => {
    if (!open) {
      setUp(false);
      return;
    }
    const menu = menuRef.current?.getBoundingClientRect();
    const button = buttonRef.current?.getBoundingClientRect();
    if (menu && button && menu.bottom > window.innerHeight - 8 && button.top > menu.height + 8) {
      setUp(true);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  useEffect(() => {
    if (!imageUrl) setOpen(false);
  }, [imageUrl]);

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  async function onShare() {
    if (!imageUrl) return;
    const payload = sharePayload(imageUrl, text);
    if (canShareFile(navigator, payload)) {
      try {
        await navigator.share({ files: [payload.file], text: payload.text });
      } catch (error) {
        // Closing the sheet is not an error; anything else falls back to the menu.
        if ((error as Error)?.name !== "AbortError") setOpen(true);
      }
      return;
    }
    setOpen((value) => !value);
  }

  function onMenuKey(event: KeyboardEvent<HTMLDivElement>) {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const move = (next: number) => {
      event.preventDefault();
      list[(next + list.length) % list.length]?.focus();
    };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(list.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") close(false);
  }

  async function onCopyText() {
    close();
    try {
      await copyText(text.trim());
      onNotify("Text copied.");
    } catch {
      onNotify("Couldn’t copy the text. Select it in the text box and copy it there.");
    }
  }

  async function onCopyImage() {
    close();
    if (!imageUrl) return;
    try {
      const blob = new Blob([pngBytes(imageUrl)], { type: "image/png" });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      onNotify("Image copied.");
    } catch {
      onNotify("Couldn’t copy the image. Download the PNG instead.");
    }
  }

  const itemClass =
    "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-ink outline-none hover:bg-bg focus-visible:bg-bg focus-visible:ring-2 focus-visible:ring-accent";

  return (
    // The menu anchors to the nearest positioned ancestor (the button row),
    // so it lines up with the row's right edge and stays on narrow screens.
    <div>
      <button
        ref={buttonRef}
        type="button"
        onClick={onShare}
        disabled={!imageUrl}
        aria-haspopup={sheet ? undefined : "menu"}
        aria-expanded={sheet ? undefined : open}
        aria-controls={open ? menuId : undefined}
        className="flex h-10 items-center justify-center gap-2 rounded-lg border border-line bg-field px-3 text-sm font-semibold text-ink disabled:opacity-40"
      >
        <Share2 className="size-4" aria-hidden="true" />
        Share
      </button>
      {open && imageUrl && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Share"
          onKeyDown={onMenuKey}
          className={`absolute right-0 z-30 w-72 max-w-full ${up ? "bottom-full mb-1.5" : "top-full mt-1.5"} rounded-lg border border-line bg-field p-1 shadow-panel`}
        >
          <a
            role="menuitem"
            href={mailtoHref(text)}
            aria-label="Email"
            aria-describedby={emailNoteId}
            onClick={() => close()}
            className={itemClass}
          >
            <Mail className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Email
              <span id={emailNoteId} className="block text-xs text-muted">
                Email links can’t attach files. Download the PNG and attach it.
              </span>
            </span>
          </a>
          <a
            role="menuitem"
            href={smsHref(text)}
            aria-label="Text message"
            aria-describedby={smsNoteId}
            onClick={() => close()}
            className={itemClass}
          >
            <MessageSquare className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Text message
              <span id={smsNoteId} className="block text-xs text-muted">
                Sends the text. On a computer, this needs a texting app.
              </span>
            </span>
          </a>
          {imageCopy && (
            <button type="button" role="menuitem" onClick={onCopyImage} className={itemClass}>
              <ImageIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Copy image
            </button>
          )}
          <button type="button" role="menuitem" onClick={onCopyText} className={itemClass}>
            <Copy className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Copy text
          </button>
        </div>
      )}
    </div>
  );
}
