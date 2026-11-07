'use client';

import type { ProductCategory } from '@fa/contracts';
import { useId, useState } from 'react';
import {
  DAYS_PER_MONTH,
  daysToUnit,
  snapDays,
  TERM_MAX_DAYS,
  TERM_MIN_DAYS,
  unitToDays,
  unitWord,
  windowFromFilter,
  type TermUnit,
} from '../model/term-window';

interface TermCount {
  months: number;
  count: number;
}

interface TermRangeFilterProps {
  category: ProductCategory;
  catalog: readonly number[];
  counts: readonly TermCount[];
  selected: readonly number[];
  onWindow: (minDay: number, maxDay: number) => void;
}

const defaultUnit = (category: ProductCategory): TermUnit =>
  category === 'treasury' ? 'weeks' : 'months';

export function TermRangeFilter({
  category,
  catalog,
  counts,
  selected,
  onWindow,
}: TermRangeFilterProps) {
  const [unit, setUnit] = useState<TermUnit>(defaultUnit(category));
  const [active, setActive] = useState<'min' | 'max'>('min');
  const id = useId();
  const { minDay, maxDay } = windowFromFilter(catalog, selected);
  const minShown = daysToUnit(minDay, unit);
  const maxShown = daysToUnit(maxDay, unit);
  const productCount = counts.reduce(
    (sum, item) =>
      item.months * DAYS_PER_MONTH >= Math.min(minDay, maxDay) &&
      item.months * DAYS_PER_MONTH <= Math.max(minDay, maxDay)
        ? sum + item.count
        : sum,
    0,
  );
  const setDays = (min: number, max: number) => {
    const lo = snapDays(Math.min(min, max), unit);
    const hi = snapDays(Math.max(min, max), unit);
    onWindow(Math.min(lo, hi), Math.max(lo, hi));
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="text-sm font-medium">Term</legend>
      <UnitSwitch id={id} unit={unit} onChange={setUnit} />
      <p className="text-sm tabular-nums">
        {minShown} – {maxShown} {unitWord(unit, maxShown)} ·{' '}
        {productCount === 1 ? '1 product' : `${String(productCount)} products`}
      </p>
      <TermTrack
        counts={counts}
        unit={unit}
        minDay={minDay}
        maxDay={maxDay}
        minShown={minShown}
        maxShown={maxShown}
        active={active}
        onActive={setActive}
        onDays={setDays}
      />
      <div className="grid grid-cols-2 gap-2">
        <UnitField
          id={`${id}-min`}
          label="Minimum term"
          placeholder="Min"
          value={minShown}
          max={daysToUnit(TERM_MAX_DAYS, unit)}
          onCommit={(value) => {
            setDays(unitToDays(value, unit), maxDay);
          }}
        />
        <UnitField
          id={`${id}-max`}
          label="Maximum term"
          placeholder="Max"
          value={maxShown}
          max={daysToUnit(TERM_MAX_DAYS, unit)}
          onCommit={(value) => {
            setDays(minDay, unitToDays(value, unit));
          }}
        />
      </div>
    </fieldset>
  );
}

function UnitSwitch(props: { id: string; unit: TermUnit; onChange: (unit: TermUnit) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Term unit"
      className="flex w-full rounded-md border border-border p-0.5"
    >
      {(['days', 'weeks', 'months'] as const).map((option) => (
        <label
          key={option}
          className={`flex flex-1 cursor-pointer items-center justify-center rounded-md px-2 py-1 text-center text-xs capitalize has-checked:bg-primary has-checked:text-primary-foreground ${option === props.unit ? '' : 'text-muted'}`}
        >
          <input
            type="radio"
            name={`${props.id}-unit`}
            className="sr-only"
            checked={props.unit === option}
            onChange={() => {
              props.onChange(option);
            }}
          />
          {option}
        </label>
      ))}
    </div>
  );
}

function TermTrack(props: {
  counts: readonly TermCount[];
  unit: TermUnit;
  minDay: number;
  maxDay: number;
  minShown: number;
  maxShown: number;
  active: 'min' | 'max';
  onActive: (handle: 'min' | 'max') => void;
  onDays: (min: number, max: number) => void;
}) {
  return (
    <div className="dual-range relative h-8">
      <div className="absolute inset-x-0 top-3 h-1.5 rounded-sm bg-divider" aria-hidden="true" />
      {props.counts.map((item) => (
        <TermTick
          key={item.months}
          item={item}
          minDay={props.minDay}
          maxDay={props.maxDay}
          onDays={props.onDays}
        />
      ))}
      <input
        type="range"
        min={TERM_MIN_DAYS}
        max={TERM_MAX_DAYS}
        step={1}
        aria-label="Minimum term"
        aria-valuetext={`${String(props.minShown)} ${unitWord(props.unit, props.minShown)}`}
        value={props.minDay}
        onPointerDown={() => {
          props.onActive('min');
        }}
        onChange={(event) => {
          props.onDays(snapDays(Number(event.target.value), props.unit), props.maxDay);
        }}
        style={{ zIndex: props.active === 'min' ? 4 : 3 }}
      />
      <input
        type="range"
        min={TERM_MIN_DAYS}
        max={TERM_MAX_DAYS}
        step={1}
        aria-label="Maximum term"
        aria-valuetext={`${String(props.maxShown)} ${unitWord(props.unit, props.maxShown)}`}
        value={props.maxDay}
        onPointerDown={() => {
          props.onActive('max');
        }}
        onChange={(event) => {
          props.onDays(props.minDay, snapDays(Number(event.target.value), props.unit));
        }}
        style={{ zIndex: props.active === 'max' ? 4 : 2 }}
      />
    </div>
  );
}

function TermTick(props: {
  item: TermCount;
  minDay: number;
  maxDay: number;
  onDays: (min: number, max: number) => void;
}) {
  const day = props.item.months * DAYS_PER_MONTH;
  const left = ((day - TERM_MIN_DAYS) / (TERM_MAX_DAYS - TERM_MIN_DAYS)) * 100;
  return (
    <button
      type="button"
      title={`${String(props.item.months)} mo · ${String(props.item.count)} products`}
      aria-label={`${String(props.item.months)} months, ${String(props.item.count)} products`}
      className="absolute top-2.5 size-2 -translate-x-1/2 cursor-pointer rounded-full bg-muted"
      style={{ left: `${String(left)}%` }}
      onClick={() => {
        const nearerMin = Math.abs(day - props.minDay) <= Math.abs(day - props.maxDay);
        props.onDays(nearerMin ? day : props.minDay, nearerMin ? props.maxDay : day);
      }}
    />
  );
}

function UnitField(props: {
  id: string;
  label: string;
  placeholder: string;
  value: number;
  max: number;
  onCommit: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={props.id} className="sr-only">
        {props.label}
      </label>
      <input
        id={props.id}
        type="number"
        inputMode="numeric"
        min={1}
        max={props.max}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(event) => {
          const next = event.target.valueAsNumber;
          if (Number.isInteger(next)) props.onCommit(next);
        }}
        className="control h-8 tabular-nums"
      />
    </div>
  );
}
