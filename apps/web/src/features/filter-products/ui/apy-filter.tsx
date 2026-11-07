'use client';

import { formatRate, rateFromPercent, type Rate } from '@fa/contracts';
import { useId, useMemo, useState } from 'react';
import { apyIndexToPercentText, APY_STEPS, percentTextToApyIndex } from '../model/apy-scale';

interface ApyFilterProps {
  /** Headline APYs as percents. Histogram geometry only. */
  percents: readonly number[];
  value: Rate | null;
  onChange: (value: Rate | null) => void;
}

const BARS = 16;

/** Visual only: a smooth bell across the rates, not the raw bin counts. */
function bellHeights(percents: readonly number[]): number[] {
  if (percents.length === 0) return [];
  const mid = (BARS - 1) / 2;
  const spread = BARS / 4.2;
  return Array.from({ length: BARS }, (_, index) => {
    const z = (index - mid) / spread;
    return Math.exp(-0.5 * z * z);
  });
}

export function ApyFilter({ percents, value, onChange }: ApyFilterProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const index = value === null ? 0 : percentTextToApyIndex(formatRate(value).slice(0, -1));
  const thumb = index ?? 0;
  const bins = useMemo(() => bellHeights(percents), [percents]);
  const peak = Math.max(1, ...bins);
  const writeIndex = (next: number) => {
    setDraft(null);
    if (next <= 0) {
      onChange(null);
      return;
    }
    onChange(rateFromPercent(apyIndexToPercentText(next)));
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        Minimum APY
      </label>
      <div className="relative h-16">
        <div
          className="pointer-events-none absolute inset-x-0 bottom-6 flex h-8 items-end gap-0.5"
          aria-hidden="true"
        >
          {bins.map((count, bin) => (
            <span
              key={apyIndexToPercentText(bin)}
              className="min-w-0 flex-1 rounded-t-sm bg-primary/25"
              style={{ height: count === 0 ? '0px' : `${String((count / peak) * 100)}%` }}
            />
          ))}
        </div>
        <input
          id={`${id}-slider`}
          type="range"
          min={0}
          max={APY_STEPS}
          step={1}
          aria-label="Minimum APY"
          aria-valuetext={thumb === 0 ? 'Any' : `${apyIndexToPercentText(thumb)}%`}
          value={thumb}
          onChange={(event) => {
            writeIndex(Number(event.target.value));
          }}
          className="apy-range absolute inset-x-0 bottom-0 w-full"
        />
      </div>
      <input
        id={id}
        inputMode="decimal"
        placeholder="e.g. 4.50"
        value={draft ?? (value === null ? '' : formatRate(value).slice(0, -1))}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={() => {
          const text = (draft ?? '').trim();
          setDraft(null);
          if (text === '') {
            onChange(null);
            return;
          }
          const next = percentTextToApyIndex(text);
          if (next !== null) writeIndex(next);
        }}
        className="control h-8 tabular-nums"
      />
    </div>
  );
}
