'use client';

// Light (default) or dark, for this visit: the choice sets data-theme on <html> and is not saved.
// Saving it needs browser storage or a cookie, which the codebase keeps for the profile alone
// (ADR-004, ESLint); a reload is light again until that is decided.
import { useState } from 'react';

type Theme = 'dark' | 'light';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  const next: Theme = theme === 'light' ? 'dark' : 'light';
  return (
    <button
      type="button"
      aria-label={`Switch to ${next} theme`}
      onClick={() => {
        if (next === 'dark') document.documentElement.dataset['theme'] = 'dark';
        else delete document.documentElement.dataset['theme'];
        setTheme(next);
      }}
      className="btn btn-sm w-8 px-0"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {theme === 'light' ? (
          // sun
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </>
        ) : (
          // moon
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        )}
      </svg>
    </button>
  );
}
