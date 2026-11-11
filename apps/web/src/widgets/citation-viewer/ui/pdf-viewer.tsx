'use client';

// Loaded only after a citation opens (next/dynamic from the panel). pdf.js stays out of the
// first load (ADR-016, ADR-018). One document stays loaded per file URL; a page change reuses it.
import { GatewayError } from '@fa/contracts';
import { getDocument, GlobalWorkerOptions, TextLayer, type PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { ErrorState } from '@/shared/ui/states';
import { findQuote } from '../model/find-quote';

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const FONTS = '/pdfjs/standard_fonts/';
const RESIZE_MS = 150;

type Status = 'loading' | 'highlighted' | 'missing' | 'error';

function isCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === 'RenderingCancelledException';
}

function loadError(cause: unknown): GatewayError {
  return new GatewayError('unavailable', 'Could not load the document', true, { cause });
}

interface PaintArgs {
  pdf: PDFDocumentProxy;
  frame: HTMLDivElement;
  canvas: HTMLCanvasElement;
  textLayer: HTMLDivElement;
  context: CanvasRenderingContext2D;
  pageNumber: number;
  quote: string | null;
  isCancelled(): boolean;
}

type PaintResult = 'highlighted' | 'missing' | 'cancelled';

async function paintPage(args: PaintArgs): Promise<PaintResult> {
  const { pdf, frame, canvas, textLayer, context, pageNumber, quote } = args;
  const page = await pdf.getPage(pageNumber);
  // A newer paint is already queued. Skip this render so two tasks never share the canvas.
  if (args.isCancelled()) return 'cancelled';
  const width = frame.clientWidth;
  const css = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
  const ratio = window.devicePixelRatio || 1;
  const output = page.getViewport({ scale: css.scale * ratio });
  canvas.width = output.width;
  canvas.height = output.height;
  canvas.style.width = `${String(css.width)}px`;
  canvas.style.height = `${String(css.height)}px`;
  textLayer.style.width = `${String(css.width)}px`;
  textLayer.style.height = `${String(css.height)}px`;
  textLayer.style.setProperty('--scale-factor', String(css.scale));
  textLayer.replaceChildren();
  const task = page.render({ canvas, canvasContext: context, viewport: output });
  await task.promise;
  const content = await page.getTextContent();
  const layer = new TextLayer({ textContentSource: content, container: textLayer, viewport: css });
  await layer.render();
  const items = content.items.map((item) => ('str' in item ? { str: item.str } : { str: '' }));
  const hits = new Set(quote === null ? [] : findQuote(items, quote));
  layer.textDivs.forEach((div, index) => {
    if (hits.has(index)) div.setAttribute('data-quote-highlight', '');
  });
  const highlighted = layer.textDivs.find((div) => div.hasAttribute('data-quote-highlight'));
  if (highlighted !== undefined) revealQuote(highlighted);
  return hits.size > 0 ? 'highlighted' : 'missing';
}

/** Firefox does not scroll an absolute span inside a clipped layer via scrollIntoView, and
 *  checkVisibility is false until the span meets the dialog's scrollport. A wide line can make
 *  the page frame scrollable; scrolling only that frame leaves the quote below the dialog fold. */
function revealQuote(quote: HTMLElement): void {
  let node: HTMLElement | null = quote.parentElement;
  while (node !== null) {
    scrollAxis(node, quote, 'y');
    scrollAxis(node, quote, 'x');
    node = node.parentElement;
  }
}

function scrollAxis(node: HTMLElement, quote: HTMLElement, axis: 'x' | 'y'): void {
  const style = getComputedStyle(node);
  const overflow = axis === 'y' ? style.overflowY : style.overflowX;
  const scrollSize = axis === 'y' ? node.scrollHeight : node.scrollWidth;
  const clientSize = axis === 'y' ? node.clientHeight : node.clientWidth;
  if ((overflow !== 'auto' && overflow !== 'scroll') || scrollSize <= clientSize) return;
  const quoteBox = quote.getBoundingClientRect();
  const box = node.getBoundingClientRect();
  const quoteStart = axis === 'y' ? quoteBox.top : quoteBox.left;
  const boxStart = axis === 'y' ? box.top : box.left;
  const quoteSize = axis === 'y' ? quoteBox.height : quoteBox.width;
  const delta = quoteStart - boxStart - (clientSize - quoteSize) / 2;
  if (axis === 'y') node.scrollTop += delta;
  else node.scrollLeft += delta;
}

function useFrameWidth(frame: RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = frame.current;
    if (el === null) return undefined;
    let timer = 0;
    const observer = new ResizeObserver((entries) => {
      const next = Math.floor(entries[0]?.contentRect.width ?? 0);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setWidth((prev) => (prev === next ? prev : next));
      }, RESIZE_MS);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [frame]);
  return width;
}

function liveText(status: Status, pageNumber: number, pageCount: number): string {
  if (status === 'error') return 'Could not load the document';
  if (status === 'loading') return `Loading page ${String(pageNumber)} of ${String(pageCount)}`;
  const found = status === 'highlighted' ? 'quote highlighted' : 'quote not found';
  return `Page ${String(pageNumber)} of ${String(pageCount)}, ${found}`;
}

/** Paints share one canvas. Overlapping `page.render` throws, and cancelling a render aborts the
 * operator-list stream the next paint is still waiting on. Run them in order and let each finish. */
function enqueuePaint(
  chain: RefObject<Promise<void>>,
  args: PaintArgs,
  done: (status: 'highlighted' | 'missing') => void,
  fail: (error: unknown) => void,
): void {
  const job = chain.current.then(async () => {
    if (args.isCancelled()) return;
    try {
      const next = await paintPage(args);
      // A resize queues another paint, but this one already found the quote. Publish it.
      // A page change must not: `done` checks the page still on screen.
      if (next !== 'cancelled') done(next);
    } catch (error: unknown) {
      if (args.isCancelled() || isCancelled(error)) return;
      fail(error);
    }
  });
  chain.current = job.then(
    () => undefined,
    () => undefined,
  );
}

function usePdfDocument(
  fileUrl: string,
  attempt: number,
  pdfRef: RefObject<PDFDocumentProxy | null>,
  report: {
    setFailure: (error: GatewayError | null) => void;
    setStatus: (status: Status) => void;
    setReady: (update: (ready: number) => number) => void;
  },
): void {
  const { setFailure, setStatus, setReady } = report;
  useEffect(() => {
    let cancelled = false;
    const task = getDocument({
      url: fileUrl,
      useWasm: false,
      standardFontDataUrl: FONTS,
      verbosity: 0,
    });
    void task.promise.then(
      (pdf) => {
        if (cancelled) return;
        pdfRef.current = pdf;
        setFailure(null);
        setReady((n) => n + 1);
      },
      (error: unknown) => {
        if (cancelled) return;
        setFailure(loadError(error));
        setStatus('error');
      },
    );
    return () => {
      cancelled = true;
      pdfRef.current = null;
      void task.destroy();
    };
  }, [fileUrl, attempt, pdfRef, setFailure, setStatus, setReady]);
}

function usePdfSession(fileUrl: string, pageNumber: number, quote: string | null, width: number) {
  const chain = useRef(Promise.resolve());
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [failure, setFailure] = useState<GatewayError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(0);
  const frame = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const shown = useRef({ pageNumber, quote });
  const viewKey = useRef('');
  shown.current = { pageNumber, quote };
  usePdfDocument(fileUrl, attempt, pdfRef, { setFailure, setStatus, setReady });

  useEffect(() => {
    const frameEl = frame.current;
    const canvas = canvasRef.current;
    const textLayer = textRef.current;
    const pdf = pdfRef.current;
    if (frameEl === null || canvas === null || textLayer === null || pdf === null || width === 0) {
      return undefined;
    }
    const context = canvas.getContext('2d');
    if (context === null) return undefined;
    let cancelled = false;
    const view = `${String(ready)}:${String(pageNumber)}:${quote ?? ''}`;
    if (viewKey.current !== view) {
      viewKey.current = view;
      setStatus('loading');
    }
    enqueuePaint(
      chain,
      {
        pdf,
        frame: frameEl,
        canvas,
        textLayer,
        context,
        pageNumber,
        quote,
        isCancelled: () => cancelled,
      },
      (next) => {
        if (shown.current.pageNumber !== pageNumber || shown.current.quote !== quote) return;
        setStatus(next);
      },
      (error: unknown) => {
        if (shown.current.pageNumber !== pageNumber || shown.current.quote !== quote) return;
        setFailure(loadError(error));
        setStatus('error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ready, pageNumber, quote, width]);

  const retry = () => {
    setStatus('loading');
    setAttempt((n) => n + 1);
  };
  return { status, failure, retry, frame, canvasRef, textRef };
}

export function PdfViewer({
  fileUrl,
  pageNumber,
  pageCount,
  quote,
}: {
  fileUrl: string;
  pageNumber: number;
  pageCount: number;
  quote: string | null;
}) {
  const frameForWidth = useRef<HTMLDivElement>(null);
  const width = useFrameWidth(frameForWidth);
  const session = usePdfSession(fileUrl, pageNumber, quote, width);
  return (
    <div className="flex flex-col gap-2">
      <p className="sr-only" aria-live="polite">
        {liveText(session.status, pageNumber, pageCount)}
      </p>
      {session.status === 'error' && session.failure !== null ? (
        <ErrorState
          error={session.failure}
          title="Could not load the document"
          onRetry={session.retry}
        />
      ) : null}
      {session.status === 'missing' && quote !== null ? (
        <p role="status" className="text-sm text-danger">
          Quote not found on this page. “{quote}”
        </p>
      ) : null}
      <div
        ref={(node) => {
          frameForWidth.current = node;
          session.frame.current = node;
        }}
        className={`relative w-full overflow-auto ${session.status === 'error' ? 'hidden' : ''}`}
      >
        <canvas ref={session.canvasRef} aria-hidden="true" className="block" />
        <div ref={session.textRef} className="pdf-text-layer" />
      </div>
    </div>
  );
}
