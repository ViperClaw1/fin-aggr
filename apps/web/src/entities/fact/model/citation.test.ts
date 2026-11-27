import { IsoDate } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { sourceDomain, sourceLabel, verificationText } from './citation';

describe('sourceDomain', () => {
  it('keeps the host without www, path or query', () => {
    expect(sourceDomain('https://www.example-bank.com/rates?x=1')).toBe('example-bank.com');
  });

  it('keeps subdomains other than www', () => {
    expect(sourceDomain('https://docs.example.org/a.pdf')).toBe('docs.example.org');
  });

  it('names a scraped bank rate as the bank website', () => {
    expect(
      sourceLabel({
        sourceId: 'bank:fdic:58177',
        sourceUrl: 'https://www.salliemae.com/savings/certificates-of-deposit',
      }),
    ).toBe('bank website');
  });
});

describe('verificationText', () => {
  it('says unverified in words', () => {
    expect(verificationText({ status: 'unverified' })).toBe('Unverified');
  });

  it('names the date and who verified', () => {
    const at = IsoDate.parse('2026-10-20');
    expect(verificationText({ status: 'verified', verifiedAt: at, by: 'human' })).toBe(
      'Verified 2026-10-20 (by a person)',
    );
    expect(verificationText({ status: 'verified', verifiedAt: at, by: 'official_api' })).toBe(
      'Verified 2026-10-20 (official API)',
    );
    expect(verificationText({ status: 'verified', verifiedAt: at, by: 'automated_check' })).toBe(
      "Verified 2026-10-20 (checked automatically against the bank's page)",
    );
  });
});
