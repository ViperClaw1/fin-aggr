'use client';

// Loaded only after a citation opens (next/dynamic from the panel). pdf.js stays out of the
// first load (ADR-016, ADR-018). Standard fonts are served from /pdfjs/standard_fonts/ so the
// text layer uses the same glyphs the page was painted with.
import { getDocument, GlobalWorkerOptions, TextLayer } from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'react';
import { findQuote } from '../model/find-quote';

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const FONTS = '/pdfjs/standard_fonts/';

interface PaintArgs {
  frame: HTMLDivElement;
  canvas: HTMLCanvasElement;
  textLayer: HTMLDivElement;
  context: CanvasRenderingContext2D;
  fileUrl: string;
  pageNumber: number;
  quote: string | null;
  gate: { cancelled: boolean };
}

async function paintPage({
  frame,
  canvas,
  textLayer,
  context,
  fileUrl,
  pageNumber,
  quote,
  gate,
}: PaintArgs): Promise<'highlighted' | 'missing'> {
  const task = getDocument({
    url: fileUrl,
    useWasm: false,
    standardFontDataUrl: FONTS,
    verbosity: 0,
  });
  try {
    const pdf = await task.promise;
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
    textLayer.replaceChildren();
    await page.render({ canvas, canvasContext: context, viewport: output }).promise;
    const content = await page.getTextContent();
    const layer = new TextLayer({
      textContentSource: content,
      container: textLayer,
      viewport: css,
    });
    await layer.render();
    const items = content.items.map((item) => ('str' in item ? { str: item.str } : { str: '' }));
    const hits = new Set(quote === null ? [] : findQuote(items, quote));
    layer.textDivs.forEach((div, index) => {
      if (hits.has(index)) div.setAttribute('data-quote-highlight', '');
    });
    layer.textDivs
      .find((div) => div.hasAttribute('data-quote-highlight'))
      ?.scrollIntoView({
        block: 'center',
      });
    await pdf.cleanup();
    return hits.size > 0 ? 'highlighted' : 'missing';
  } finally {
    if (gate.cancelled) await task.destroy();
  }
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
  const frame = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'highlighted' | 'missing' | 'loading'>('loading');

  useEffect(() => {
    const frameEl = frame.current;
    const canvas = canvasRef.current;
    const textLayer = textRef.current;
    if (frameEl === null || canvas === null || textLayer === null) return undefined;
    const context = canvas.getContext('2d');
    if (context === null) return undefined;
    const gate = { cancelled: false };
    void paintPage({
      frame: frameEl,
      canvas,
      textLayer,
      context,
      fileUrl,
      pageNumber,
      quote,
      gate,
    })
      .then((next) => {
        if (!gate.cancelled) setStatus(next);
      })
      .catch(() => {
        if (!gate.cancelled) setStatus('missing');
      });
    return () => {
      gate.cancelled = true;
    };
  }, [fileUrl, pageNumber, quote]);

  const live =
    status === 'loading'
      ? `Loading page ${String(pageNumber)} of ${String(pageCount)}`
      : `Page ${String(pageNumber)} of ${String(pageCount)}, ${status === 'highlighted' ? 'quote highlighted' : 'quote not found'}`;

  return (
    <div className="flex flex-col gap-2">
      <p className="sr-only" aria-live="polite">
        {live}
      </p>
      {status === 'missing' && quote !== null ? (
        <p role="status" className="text-sm text-danger">
          Quote not found on this page. “{quote}”
        </p>
      ) : null}
      <div ref={frame} className="relative w-full overflow-auto">
        <canvas ref={canvasRef} aria-hidden="true" className="block" />
        <div ref={textRef} className="pdf-text-layer" />
      </div>
    </div>
  );
}
