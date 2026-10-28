import { type Cents, formatRate, formatUsd, type Rate } from '@fa/contracts';
import { useId } from 'react';
import { isOver, position } from './scale';

interface Mark<V> {
  value: V;
  label: string;
}
interface Scale<K, V> {
  kind: K;
  max: V;
  value: V;
  /** A limit or a market median, drawn as a vertical line. */
  marker?: Mark<V>;
  /** Qualitative ranges in ascending order, each up to its value. */
  bands?: readonly { upTo: V; label: string }[];
}

/** One kind per chart: `usd` accepts only Cents, `rate` only Rate (checked by the compiler). */
export type BulletChartProps = {
  label: string;
  /** Shown when the value is past `max`, e.g. "Over by $50,000.00" (the caller does the math). */
  overflowText?: string;
} & (Scale<'usd', Cents> | Scale<'rate', Rate>);

const BAND_SHADES = ['opacity-10', 'opacity-20', 'opacity-30'];

/**
 * Server component, no client JS. The SVG is decoration (aria-hidden); the visible text below it
 * carries every value, so nothing depends on the drawing or on colour.
 */
export function BulletChart(props: BulletChartProps) {
  const id = useId();
  const fmt = (v: Cents | Rate): string => (typeof v === 'number' ? formatUsd(v) : formatRate(v));
  const { max, value, marker, bands = [] } = props;
  const over = isOver(value, max);
  const edges = bands.map((b) => position(b.upTo, max));
  return (
    <div role="group" aria-labelledby={id} className="space-y-1">
      <p id={id} className="text-sm font-medium">
        {props.label}
      </p>
      <svg
        aria-hidden="true"
        viewBox="0 0 100 10"
        preserveAspectRatio="none"
        className="block h-6 w-full text-foreground"
      >
        {bands.map((b, i) => (
          <rect
            key={b.label}
            x={i === 0 ? 0 : edges[i - 1]}
            y={0}
            width={(edges[i] ?? 0) - (i === 0 ? 0 : (edges[i - 1] ?? 0))}
            height={10}
            fill="currentColor"
            className={BAND_SHADES[i % BAND_SHADES.length]}
          />
        ))}
        <rect
          data-part="value"
          x={0}
          y={3}
          width={position(value, max)}
          height={4}
          className="fill-accent"
        />
        {marker === undefined ? null : (
          <line
            data-part="marker"
            x1={position(marker.value, max)}
            x2={position(marker.value, max)}
            y1={0}
            y2={10}
            stroke="currentColor"
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <dl className="flex flex-wrap gap-x-4 text-sm">
        <div className="flex gap-1">
          <dt className="text-muted">Value</dt>
          <dd className="font-medium tabular-nums">{fmt(value)}</dd>
        </div>
        {marker === undefined ? null : (
          <div className="flex gap-1">
            <dt className="text-muted">
              <span aria-hidden="true">│ </span>
              {marker.label}
            </dt>
            <dd className="tabular-nums">{fmt(marker.value)}</dd>
          </div>
        )}
        {bands.map((b) => (
          <div key={b.label} className="flex gap-1">
            <dt className="text-muted">{b.label}</dt>
            <dd className="tabular-nums">up to {fmt(b.upTo)}</dd>
          </div>
        ))}
      </dl>
      {over ? (
        <p className="text-sm font-medium text-warn">
          <span aria-hidden="true">⚠ </span>
          {props.overflowText ?? 'Above the end of the scale'}
        </p>
      ) : null}
    </div>
  );
}
