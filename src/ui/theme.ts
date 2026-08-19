/**
 * Light and dark, kept in one place.
 *
 * The palette itself lives in index.css as CSS custom properties, and every
 * Tailwind colour token resolves to one of them, so switching themes is one
 * attribute on <html> rather than a second set of classes on every element.
 *
 * index.html sets the attribute before the first paint from the same two
 * sources this module reads — the stored choice, then the OS preference — so
 * the page never flashes the wrong colours on the way in.
 */

export type Theme = "dark" | "light";

const STORE_KEY = "ggp_theme";
const listeners = new Set<(t: Theme) => void>();

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(STORE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

/** What is actually on screen right now. */
export function currentTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return stored() ?? systemTheme();
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  // Lets the browser paint form controls, scrollbars and the address bar to match.
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem(STORE_KEY, theme);
  } catch {
    /* private mode: the choice holds for this tab only */
  }
  listeners.forEach((l) => l(theme));
}

export function onThemeChange(fn: (t: Theme) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
