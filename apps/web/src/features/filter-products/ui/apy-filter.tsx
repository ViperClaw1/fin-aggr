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

const BINS = APY_STEPS;

export function ApyFilter({ percents, value, onChange }: ApyFilterProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const index = value === null ? 0 : percentTextToApyIndex(formatRate(value).slice(0, -1));
  const thumb = index ?? 0;
  const bins = useMemo(() => {
    const counts = Array.from({ length: BINS }, () => 0);
    for (const percent of percents) {
      const bin = Math.min(BINS - 1, Math.max(0, Math.floor(percent / 0.05)));
      const current = counts[bin];
      if (current !== undefined) counts[bin] = current + 1;
    }
    return counts;
  }, [percents]);
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
      <div className="relative h-10">
        <div
          className="pointer-events-none absolute inset-x-0 bottom-3 flex h-6 items-end"
          aria-hidden="true"
        >
          {bins.map((count, bin) => (
            <span
              key={apyIndexToPercentText(bin)}
              className="flex-1 bg-accent/30"
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
          className="absolute inset-x-0 bottom-1 w-full"
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
