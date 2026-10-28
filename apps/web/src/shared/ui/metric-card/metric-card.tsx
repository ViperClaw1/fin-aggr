import { useId, type ReactNode } from 'react';

/** Warn and danger must say why in words: colour is never the only signal. */
type Tone =
  { tone?: 'neutral' | 'ok'; toneLabel?: string } | { tone: 'warn' | 'danger'; toneLabel: string };

type MetricCardProps = Tone & {
  label: string;
  /** Already formatted (RateValue, formatUsd, FactValue), never a raw number. */
  value: ReactNode;
  hint?: string;
};

const TONE = {
  neutral: { box: 'border-border', badge: '', icon: '' },
  ok: { box: 'border-ok', badge: 'bg-ok-bg text-ok', icon: '✓' },
  warn: { box: 'border-warn', badge: 'bg-warn-bg text-warn', icon: '⚠' },
  danger: { box: 'border-danger', badge: 'bg-danger-bg text-danger', icon: '✕' },
} as const;

export function MetricCard({ label, value, hint, tone = 'neutral', toneLabel }: MetricCardProps) {
  const id = useId();
  const style = TONE[tone];
  return (
    <div
      role="group"
      aria-labelledby={`${id}-label`}
      aria-describedby={hint === undefined ? undefined : `${id}-hint`}
      className={`rounded border-2 p-4 ${style.box}`}
    >
      <p id={`${id}-label`} className="text-sm text-muted">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {toneLabel === undefined ? null : (
        <p className={`mt-2 inline-block rounded px-2 py-0.5 text-sm font-medium ${style.badge}`}>
          {style.icon === '' ? null : <span aria-hidden="true">{style.icon} </span>}
          {toneLabel}
        </p>
      )}
      {hint === undefined ? null : (
        <p id={`${id}-hint`} className="mt-2 text-sm text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
