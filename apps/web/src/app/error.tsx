'use client';

// A page failed to render: the layout (header, footer, demo banner) stays, the page body is this.
import { SystemPage } from './system-page';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <SystemPage
      code="Error"
      title="Something went wrong"
      text="This page could not be shown. Try again, or go back to the home page."
      action={
        <button type="button" className="btn btn-primary" onClick={reset}>
          Try again
        </button>
      }
    />
  );
}
