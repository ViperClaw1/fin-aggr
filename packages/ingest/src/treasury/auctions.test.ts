import { describe, expect, it } from 'vitest';
import { directShapeProblems, fiscalShapeProblems } from './auctions';

const FISCAL_ROW = {
  cusip: '912797WF0',
  security_type: 'Bill',
  security_term: '4-Week',
  issue_date: '2026-11-17',
  maturity_date: '2026-12-15',
  high_yield: 'null',
  int_rate: 'null',
  int_payment_frequency: 'null',
  min_to_issue: 'null',
};

describe('auction field shape', () => {
  it('accepts the official columns and names a missing one', () => {
    expect(fiscalShapeProblems(JSON.stringify({ data: [FISCAL_ROW] }))).toEqual([]);
    const row: Record<string, string> = { ...FISCAL_ROW };
    delete row['cusip'];
    expect(fiscalShapeProblems(JSON.stringify({ data: [row] }))).toEqual(['cusip']);
  });

  it('accepts a TreasuryDirect auction row', () => {
    expect(
      directShapeProblems(
        JSON.stringify([
          {
            cusip: '912797WF0',
            securityType: 'Bill',
            securityTerm: '4-Week',
            issueDate: '2026-11-17T00:00:00',
            maturityDate: '2026-12-15T00:00:00',
            highRate: '3.955',
            investmentRate: '4.022',
            interestRate: '',
            frequencyOfInterestPayments: '',
            minimumToIssueAmount: '100',
          },
        ]),
      ),
    ).toEqual([]);
  });
});
