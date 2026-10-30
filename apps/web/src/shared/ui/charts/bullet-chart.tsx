import { type Cents, formatPercentPoints, formatRate, formatUsd, type Rate } from '@fa/contracts';
import { useId } from 'react';
import { barSpan, isOver, position, positionBetween } from './scale';

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

interface PercentScale {
  kind: 'percent';
  /** May be negative, so a metric such as return on assets can sit left of zero. */
  min: number;
  max: number;
  value: number;
  marker?: Mark<number>;
  bands?: readonly { upTo: number; label: string }[];
}

/** One kind per chart: `usd` is Cents, `rate` is Rate, `percent` is a plain number (bank metrics). */
export type BulletChartProps = {
  label: string;
  /** Shown when the value is past the axis, e.g. "Over by $50,000.00" (the caller does the math). */
  overflowText?: string;
} & (Scale<'usd', Cents> | Scale<'rate', Rate> | PercentScale);

const BAND_SHADES = ['opacity-10', 'opacity-20', 'opacity-30'];

/**
 * Server component, no client JS. The SVG is decoration (aria-hidden); the visible text below it
 * carries every value, so nothing depends on the drawing or on colour.
 */
export function BulletChart(props: BulletChartProps) {
  if (props.kind === 'percent') return <PercentBullet {...props} />;
  return <MoneyBullet {...props} />;
}

function PercentBullet(props: Extract<BulletChartProps, { kind: 'percent' }>) {
  const id = useId();
  const { min, max, value, marker, bands = [] } = props;
  const bar = barSpan(value, min, max);
  const outside = value > max || value < min;
  const edges = bands.map((b) => positionBetween(b.upTo, min, max));
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
          x={bar.x}
          y={3}
          width={bar.width}
          height={4}
          className="fill-accent"
        />
        {marker === undefined ? null : (
          <line
            data-part="marker"
            x1={positionBetween(marker.value, min, max)}
            x2={positionBetween(marker.value, min, max)}
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
          <dd className="font-medium tabular-nums">{formatPercentPoints(value)}</dd>
        </div>
        {marker === undefined ? null : (
          <div className="flex gap-1">
            <dt className="text-muted">
              <span aria-hidden="true">│ </span>
              {marker.label}
            </dt>
            <dd className="tabular-nums">{formatPercentPoints(marker.value)}</dd>
          </div>
        )}
        {bands.map((b) => (
          <div key={b.label} className="flex gap-1">
            <dt className="text-muted">{b.label}</dt>
            <dd className="tabular-nums">up to {formatPercentPoints(b.upTo)}</dd>
          </div>
        ))}
      </dl>
      {outside ? (
        <p className="text-sm font-medium text-warn">
          <span aria-hidden="true">⚠ </span>
          {props.overflowText ?? 'Outside the scale'}
        </p>
      ) : null}
    </div>
  );
}

function MoneyBullet(props: Exclude<BulletChartProps, { kind: 'percent' }>) {
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
