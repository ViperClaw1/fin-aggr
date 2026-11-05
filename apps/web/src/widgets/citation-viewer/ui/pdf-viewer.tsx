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
  render: { cancel: () => void };
}

async function paintPage(args: PaintArgs): Promise<'highlighted' | 'missing'> {
  const { pdf, frame, canvas, textLayer, context, pageNumber, quote } = args;
  const page = await pdf.getPage(pageNumber);
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
  args.render.cancel = () => {
    task.cancel();
  };
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

/** Firefox does not scroll an absolute span inside overflow:hidden via scrollIntoView, and
 *  checkVisibility is false until the span meets the dialog's scrollport. */
function revealQuote(quote: HTMLElement): void {
  let node: HTMLElement | null = quote.parentElement;
  while (node !== null) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) {
      const quoteBox = quote.getBoundingClientRect();
      const box = node.getBoundingClientRect();
      node.scrollTop += quoteBox.top - box.top - (node.clientHeight - quoteBox.height) / 2;
      return;
    }
    node = node.parentElement;
  }
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

function usePdfSession(fileUrl: string, pageNumber: number, quote: string | null, width: number) {
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [failure, setFailure] = useState<GatewayError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(0);
  const frame = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frameEl = frame.current;
    const canvas = canvasRef.current;
    const textLayer = textRef.current;
    const pdf = pdfRef.current;
    if (frameEl === null || canvas === null || textLayer === null || pdf === null || width === 0)
      return undefined;
    const context = canvas.getContext('2d');
    if (context === null) return undefined;
    let cancelled = false;
    const render = { cancel: () => undefined };
    setStatus('loading');
    void paintPage({ pdf, frame: frameEl, canvas, textLayer, context, pageNumber, quote, render })
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch((error: unknown) => {
        if (cancelled || isCancelled(error)) return;
        setFailure(loadError(error));
        setStatus('error');
      });
    return () => {
      cancelled = true;
      render.cancel();
    };
  }, [ready, pageNumber, quote, width]);

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
  }, [fileUrl, attempt]);

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
