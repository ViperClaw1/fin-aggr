import { Cents } from '@fa/contracts';
import { describe, expect, it } from 'vitest';
import { profileSummary } from './summary';

const COMPLETE = {
  filingStatus: 'single',
  stateCode: 'NY',
  taxableIncome: Cents.parse(8500000),
  residency: 'us_citizen',
} as const;

describe('profileSummary', () => {
  it('invites to add a profile while no required field is filled', () => {
    expect(profileSummary({ age: 40 })).toBe('Add your profile');
  });
  it('counts the filled required fields', () => {
    expect(profileSummary({ stateCode: 'NY', taxableIncome: Cents.parse(1) })).toBe(
      'Profile: 2 of 4 filled',
    );
  });
  it('shows the state of a complete profile', () => {
    expect(profileSummary(COMPLETE)).toBe('Profile: NY · complete');
  });
  it('never shows the income', () => {
    expect(profileSummary(COMPLETE)).not.toMatch(/85|\$/);
  });
});
