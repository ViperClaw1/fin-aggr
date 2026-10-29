import { Cents } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { profileSummary } from './summary';

describe('profileSummary', () => {
  it('invites to add a profile when state and income are empty', () => {
    expect(profileSummary({ filingStatus: 'single' })).toBe('Add your profile');
  });
  it('shows the state and the income', () => {
    expect(profileSummary({ stateCode: 'NY', taxableIncome: Cents.parse(8500000) })).toBe(
      'Profile: NY, $85,000.00',
    );
  });
  it('shows what is there when one of them is missing', () => {
    expect(profileSummary({ stateCode: 'NY' })).toBe('Profile: NY');
  });
});
