import type { Locale } from "./types";

/** Split out from i18n.ts to avoid a circular import: state.ts needs this for its initial value, and i18n.ts imports appStore from state.ts. */
export function detectInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem("ptg-locale");
    if (saved === "en" || saved === "ko") return saved;
  } catch {
    /* localStorage unavailable (e.g. private mode) - fall through to browser language */
  }
  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("ko") ? "ko" : "en";
}
