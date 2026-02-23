import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Copy text to clipboard with fallback for non-secure (HTTP) contexts.
 * Returns true if the copy succeeded, false otherwise.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Modern clipboard API (HTTPS / localhost)
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy fallback
    }
  }

  // Fallback for HTTP contexts: execCommand('copy')
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText =
      "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:none;outline:none;background:transparent;opacity:0;";
    document.body.appendChild(ta);
    ta.focus();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
