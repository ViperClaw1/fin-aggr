import { describe, expect, it } from 'vitest';
import { BANK_DATE_NOT_STATED, classifyTableRow, type TableRowInput } from './table-rules';

function row(over: Partial<TableRowInput> = {}): TableRowInput {
  return {
    termText: '12 Month',
    conditionText: '',
    asOfText: 'November 1, 2026',
    opensOnlineNationwide: true,
    ...over,
  };
}

describe('HTML rate-table rules', () => {
  it('maps one stated month to termMonths', () => {
    expect(classifyTableRow(row()).termMonths).toBe(12);
    expect(classifyTableRow(row({ termText: '12-Month' })).termMonths).toBe(12);
    expect(classifyTableRow(row({ termText: '6–6 Month' })).termMonths).toBe(6);
  });

  it('does not turn a term span into one termMonths', () => {
    const reading = classifyTableRow(row({ termText: '6–8 Month' }));
    expect(reading.termMonths).toBeNull();
    expect(reading.termRange).toEqual({ low: 6, high: 8, text: '6–8 Month' });
    expect(reading.reviews).toContain('term_range:6-8');
    expect(classifyTableRow(row({ termText: '6-8 Months' })).reviews).toContain('term_range:6-8');
    expect(classifyTableRow(row({ termText: '6 to 8 months' })).termRange?.high).toBe(8);
  });

  it('sends new money and a requirements condition to review with that text', () => {
    const reading = classifyTableRow(
      row({ conditionText: 'New money only, if requirements met.' }),
    );
    expect(reading.termMonths).toBe(12);
    expect(reading.reviews).toEqual(['condition:New money only, if requirements met.']);
  });

  it('keeps an empty bank date unknown and does not take a fetch time', () => {
    const reading = classifyTableRow(row({ asOfText: '  ' }));
    expect(reading.statedAsOf).toBeNull();
    expect(reading.dateFlag).toBe(BANK_DATE_NOT_STATED);
    expect(reading.reviews).toContain('bank date not stated');
    expect(JSON.stringify(reading)).not.toContain('retrievedAt');
  });

  it('holds state eligibility when accounts are not opened online nationwide', () => {
    const reading = classifyTableRow(row({ opensOnlineNationwide: false }));
    expect(reading.reviews).toEqual(['state_eligibility']);
    expect(classifyTableRow(row()).reviews).toEqual([]);
  });
});
