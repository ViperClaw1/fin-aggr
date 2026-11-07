import type { ProfileFill } from '../model/summary';

/** Shown below 388px in place of the summary text. The button keeps that text for the name. */
export function ProfileGlyph({ fill }: { fill: ProfileFill }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="3" />
      <path d="M6.5 19c.8-2.4 2.9-3.5 5.5-3.5" />
      {fill === 'empty' ? <path d="M14 19h4" /> : null}
      {fill === 'partial' ? <path d="M14 19h4M16 17v4" /> : null}
      {fill === 'complete' ? <path d="M14 18.5 16.2 20.5 20 15.5" /> : null}
    </svg>
  );
}
