'use client';

// The root layout itself failed: this replaces it, so it brings its own <html>, styles and the demo
// banner (AC-5 holds on every page). Light, like the default theme.
import './globals.css';
import { DemoDataBanner } from '@/shared/ui/demo-banner';
import { SystemPage } from './system-page';

// eslint-disable-next-line import-x/no-default-export -- Next file convention needs a default export, T23
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <DemoDataBanner />
        <SystemPage
          code="Error"
          title="Something went wrong"
          text="The site could not be shown. Try again in a moment."
          action={
            <button type="button" className="btn btn-primary" onClick={reset}>
              Try again
            </button>
          }
        />
      </body>
    </html>
  );
}
