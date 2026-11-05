'use client';

// Mounted once in the root layout, inside <Suspense>. The panel (gateway, pdf.js, react-query)
// loads only while a citation is open, so none of them join the first load (ADR-016).
import dynamic from 'next/dynamic';
import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { citationReturnTarget, useOpenCitation } from '@/features/open-citation';
import { Skeleton } from '@/shared/ui/states';

const Panel = dynamic(() => import('./citation-panel').then((m) => m.CitationPanel), {
  ssr: false,
  loading: () => <Skeleton label="Loading the document" className="h-40 w-full" />,
});

export function CitationViewerHost() {
  const { current, close, setPage } = useOpenCitation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (current !== null && !dialog.open) {
      returnFocus.current =
        citationReturnTarget() ??
        (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      dialog.showModal();
    }
    if (current === null && dialog.open) dialog.close();
  }, [current]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return undefined;
    const onClick = (event: MouseEvent): void => {
      if (event.target === dialog) dialog.close();
    };
    dialog.addEventListener('click', onClick);
    return () => {
      dialog.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="sheet m-0 ml-auto h-dvh max-h-none w-full max-w-3xl overflow-hidden border-l border-divider bg-background p-0 text-foreground"
      onClose={() => {
        const restore = returnFocus.current;
        const action = close();
        const focus = (): void => {
          restore?.focus();
        };
        // WebKit moves focus to the body after this event, and again when history.back()
        // finishes. Focus once the navigation has settled.
        if (action === 'back') {
          window.addEventListener(
            'popstate',
            () => {
              setTimeout(focus, 0);
            },
            { once: true },
          );
        }
        setTimeout(focus, 0);
      }}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-divider px-4 py-3 sm:px-6">
          <h2 id={titleId} className="text-lg font-semibold">
            Source
          </h2>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              dialogRef.current?.close();
            }}
          >
            Close
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          {current === null ? null : <Panel current={current} onPage={setPage} />}
        </div>
      </div>
    </dialog>
  );
}
