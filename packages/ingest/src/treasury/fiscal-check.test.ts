import { describe, expect, it } from 'vitest';
import { fiscalMismatches } from './fiscal-check';

// Real pairs, TreasuryDirect and Fiscal Data, read 2026-11-22.
const bill = {
  cusip: '912797VT1',
  securityType: 'Bill',
  securityTerm: '13-Week',
  issueDate: '2026-10-15T00:00:00',
  highPrice: '98.967403',
  highYield: '',
};
const note = {
  cusip: '91282CRQ6',
  securityType: 'Note',
  securityTerm: '3-Year',
  issueDate: '2026-10-15T00:00:00',
  highPrice: '99.842840',
  highYield: '4.932',
};
const fiscal = (rows: object[]): string => JSON.stringify({ data: rows });
const FISCAL_BILL = { cusip: '912797VT1', issue_date: '2026-10-15', high_price: '98.967403' };
const FISCAL_NOTE = { cusip: '91282CRQ6', issue_date: '2026-10-15', high_yield: '4.9320' };

describe('fiscalMismatches', () => {
  it('passes when the shared bill price and note yield agree', () => {
    expect(
      fiscalMismatches(JSON.stringify([bill, note]), fiscal([FISCAL_BILL, FISCAL_NOTE])),
    ).toEqual([]);
  });

  it('names the CUSIP whose price differs', () => {
    const off = { ...FISCAL_BILL, high_price: '98.967404' };
    expect(fiscalMismatches(JSON.stringify([bill, note]), fiscal([off, FISCAL_NOTE]))).toEqual([
      '912797VT1',
    ]);
  });

  it('skips a Fiscal row that has no result yet', () => {
    const pending = { ...FISCAL_BILL, high_price: null };
    expect(fiscalMismatches(JSON.stringify([bill, note]), fiscal([pending, FISCAL_NOTE]))).toEqual(
      [],
    );
  });

  it('reports no_overlap when the feeds share no auction', () => {
    expect(fiscalMismatches(JSON.stringify([bill]), fiscal([FISCAL_NOTE]))).toEqual(['no_overlap']);
  });
});
