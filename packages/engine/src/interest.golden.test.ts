import { Cents, EarlyWithdrawal } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { computeInterest, type YieldProduct } from './interest';
import { toCents } from './money';
import { cd, THREE_TIERS } from './test-data';
// independent calc: packages/engine/golden/interest.py, whose output is interest.json
import EXPECTED from '../golden/interest.json';

const P = Cents.parse(1000000);
const gross = (p: YieldProduct, principal: Cents, months: number): Cents =>
  toCents(computeInterest(p, principal, months).gross);
const penalty = (rule: EarlyWithdrawal, months: number): Cents =>
  toCents(computeInterest(cd({ earlyWithdrawal: rule }), P, months).penalty);
const savings = (tierMode: YieldProduct['tierMode']): YieldProduct =>
  cd({ category: 'savings', termMonths: null, tierMode, tiers: THREE_TIERS });

describe('gross interest, one tier', () => {
  it('golden: 6 months at 5% APY', () => {
    expect(gross(cd({ termMonths: 6 }), P, 6)).toBe(EXPECTED['cd.6m']);
  });
  it('golden: 12 months at 5% APY', () => {
    expect(gross(cd(), P, 12)).toBe(EXPECTED['cd.12m']);
  });
  it('golden: 18 months at 5% APY', () => {
    expect(gross(cd({ termMonths: 18 }), P, 18)).toBe(EXPECTED['cd.18m']);
  });
});

describe('gross interest, three tiers', () => {
  it('golden: whole_balance at the top of a tier earns that tier', () => {
    expect(gross(savings('whole_balance'), Cents.parse(999999), 12)).toBe(
      EXPECTED['whole.atTierMax'],
    );
  });
  it('golden: whole_balance one cent above moves everything to the next tier', () => {
    expect(gross(savings('whole_balance'), Cents.parse(1000000), 12)).toBe(
      EXPECTED['whole.centAbove'],
    );
  });
  it('golden: marginal at the next tier minimum earns only the first tier', () => {
    expect(gross(savings('marginal'), Cents.parse(1000000), 12)).toBe(
      EXPECTED['marginal.atTierMin'],
    );
  });
  it('golden: marginal one cent above earns the next rate on that cent only', () => {
    expect(gross(savings('marginal'), Cents.parse(1000001), 12)).toBe(
      EXPECTED['marginal.centAbove'],
    );
  });
  it('golden: marginal across all three tiers', () => {
    expect(gross(savings('marginal'), Cents.parse(15000000), 12)).toBe(
      EXPECTED['marginal.allThree'],
    );
  });
});

describe('early withdrawal, 12-month CD closed after 6 months', () => {
  it('golden: 90 days of simple interest on a 365-day year', () => {
    expect(penalty(EarlyWithdrawal.parse({ kind: 'days_of_interest', days: 90 }), 6)).toBe(
      EXPECTED['penalty.days90'],
    );
  });
  it('golden: 6 months of interest', () => {
    expect(penalty(EarlyWithdrawal.parse({ kind: 'months_of_interest', months: 6 }), 6)).toBe(
      EXPECTED['penalty.months6'],
    );
  });
  it('golden: 1% of principal', () => {
    const rule = EarlyWithdrawal.parse({ kind: 'percent_of_principal', rate: '0.01' });
    expect(penalty(rule, 6)).toBe(EXPECTED['penalty.percent1']);
  });
  it('golden: the penalty may exceed the interest earned', () => {
    const r = computeInterest(
      cd({ earlyWithdrawal: EarlyWithdrawal.parse({ kind: 'months_of_interest', months: 6 }) }),
      P,
      1,
    );
    expect([toCents(r.gross), toCents(r.penalty)]).toEqual([
      EXPECTED['cd.1m'],
      EXPECTED['penalty.months6'],
    ]);
  });
});
