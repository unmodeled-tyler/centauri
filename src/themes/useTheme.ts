import { useEffect, useRef } from "react";
import { THEMES, type ThemeId } from "./themes";

const THEME_STORAGE_KEY = "centauri-theme";

export function getStoredTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && stored in THEMES) return stored as ThemeId;
  } catch {}
  return "dark";
}

export function storeTheme(id: ThemeId) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {}
}

export function applyTheme(id: ThemeId) {
  const theme = THEMES[id];
  const root = document.documentElement;

  root.setAttribute("data-theme", id);

  for (const [key, value] of Object.entries(theme.variables)) {
    root.style.setProperty(key, value);
  }
}

export function useTheme(themeId: ThemeId) {
  const prevRef = useRef<ThemeId>("dark");

  useEffect(() => {
    const prev = THEMES[prevRef.current];
    const root = document.documentElement;

    // Clear previous theme's variables
    for (const key of Object.keys(prev.variables)) {
      root.style.removeProperty(key);
    }

    applyTheme(themeId);
    prevRef.current = themeId;
  }, [themeId]);
}
