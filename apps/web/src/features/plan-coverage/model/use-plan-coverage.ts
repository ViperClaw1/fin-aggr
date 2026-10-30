'use client';

// Account rows and planCoverage. The rows live in component state only (ADR-004): nothing is stored.
// The engine loads once a row exists, so an empty visit does not parse decimal.js.
import {
  centsFromSafeInteger,
  type Assumption,
  type CalcStep,
  type Cents,
  type Id,
  type Institution,
  type InsuranceRules,
} from '@fa/contracts';
import type { categoryLimit, planCoverage } from '@fa/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import { lazyOnce } from '@/shared/lib/lazy-once';

export interface CoverageInstitution {
  id: Id;
  name: string;
  kind: Institution['kind'];
  regulator: Institution['regulator'];
}

export interface AccountDraft {
  key: number;
  /** null until the row has a bank */
  institutionId: Id | null;
  category: 'single' | 'joint';
  amount: Cents | null;
}

interface AllocationView {
  institutionId: Id;
  name: string;
  category: 'single' | 'joint';
  amount: Cents;
  limit: Cents;
}

export interface CoverageResult {
  allocations: AllocationView[];
  insuredTotal: Cents;
  uninsuredTotal: Cents;
  steps: readonly CalcStep[];
  assumptions: readonly Assumption[];
  warnings: readonly string[];
}

interface Engine {
  planCoverage: typeof planCoverage;
  categoryLimit: typeof categoryLimit;
}

const loadEngine = lazyOnce((): Promise<Engine> => import('@fa/engine'));

export function usePlanCoverage(
  institutions: readonly CoverageInstitution[],
  rules: InsuranceRules,
) {
  const [rows, setRows] = useState<AccountDraft[]>([]);
  const [engine, setEngine] = useState<Engine | null>(null);
  const nextKey = useRef(1);
  const focusKey = useRef<number | null>(null);
  useEffect(() => {
    if (rows.length === 0 || engine !== null) return;
    loadEngine().then(
      (mod) => {
        setEngine(() => mod);
      },
      () => undefined,
    );
  }, [rows.length, engine]);
  const plan = useMemo(
    () => (engine === null ? null : runPlan(engine, rows, institutions, rules)),
    [engine, rows, institutions, rules],
  );
  const add = () => {
    const key = nextKey.current;
    nextKey.current += 1;
    focusKey.current = key;
    setRows((current) => [
      ...current,
      { key, institutionId: null, category: 'single', amount: null },
    ]);
  };
  const remove = (key: number) => {
    setRows((current) => current.filter((row) => row.key !== key));
  };
  const update = (key: number, patch: Partial<Omit<AccountDraft, 'key'>>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };
  const takeFocus = (key: number): boolean => {
    if (focusKey.current !== key) return false;
    focusKey.current = null;
    return true;
  };
  return { rows, plan, add, remove, update, takeFocus };
}

function runPlan(
  engine: Engine,
  rows: readonly AccountDraft[],
  institutions: readonly CoverageInstitution[],
  rules: InsuranceRules,
): CoverageResult | null {
  const accounts = rows.flatMap((row) =>
    row.amount === null ? [] : [{ category: row.category, amount: row.amount }],
  );
  if (accounts.length === 0) return null;
  const byId = new Map(institutions.map((item) => [item.id, item]));
  const selected = rows.flatMap((row) => (row.institutionId === null ? [] : [row.institutionId]));
  const selectedSet = new Set(selected);
  const ordered = [
    ...selected.flatMap((id) => {
      const inst = byId.get(id);
      return inst === undefined ? [] : [inst];
    }),
    ...institutions.filter((item) => !selectedSet.has(item.id) && item.kind !== 'fintech_partner'),
  ];
  const seen = new Set<Id>();
  const candidates = ordered.flatMap((item) => {
    if (seen.has(item.id)) return [];
    seen.add(item.id);
    return [
      {
        institutionId: item.id,
        regulator: item.regulator,
        kind: item.kind,
        preference: seen.size,
      },
    ];
  });
  const result = engine.planCoverage({
    accounts,
    candidates,
    rules,
    interestReservePerAllocation: centsFromSafeInteger(0),
  });
  return {
    allocations: result.allocations.flatMap((allocation) => {
      const inst = byId.get(allocation.institutionId);
      if (inst === undefined) return [];
      return [
        {
          institutionId: allocation.institutionId,
          name: inst.name,
          category: allocation.category,
          amount: allocation.amount,
          limit: engine.categoryLimit(rules, inst.regulator, allocation.category),
        },
      ];
    }),
    insuredTotal: result.insuredTotal,
    uninsuredTotal: result.uninsuredTotal,
    steps: result.steps,
    assumptions: result.assumptions,
    warnings: result.warnings,
  };
}
