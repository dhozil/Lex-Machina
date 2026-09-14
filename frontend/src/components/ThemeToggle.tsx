import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const KEY = "lex-machina-theme";

export function initTheme(): void {
  try {
    if (localStorage.getItem(KEY) === "light") return;
    document.documentElement.dataset.theme = "dark";
  } catch {
    document.documentElement.dataset.theme = "dark";
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === "light" ? "light" : "dark",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const dark = theme === "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="4.4" stroke="currentColor" strokeWidth="1.6" />
          <line x1="12" y1="2.5" x2="12" y2="5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="12" y1="19" x2="12" y2="21.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="2.5" y1="12" x2="5" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="19" y1="12" x2="21.5" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="5.3" y1="5.3" x2="7" y2="7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="17" y1="17" x2="18.7" y2="18.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="5.3" y1="18.7" x2="7" y2="17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="17" y1="7" x2="18.7" y2="5.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M20 13.2A8.2 8.2 0 0 1 10.8 4 8.2 8.2 0 1 0 20 13.2Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}
