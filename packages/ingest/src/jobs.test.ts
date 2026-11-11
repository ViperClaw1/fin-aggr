import { afterEach, describe, expect, it } from 'vitest';
import { registerConnectors } from './jobs';
import { resetJobs } from './schedule';

describe('connector registration', () => {
  afterEach(() => {
    resetJobs();
  });

  it('registers fdic institutions once', () => {
    registerConnectors();
    expect(() => {
      registerConnectors();
    }).toThrow('source fdic-institutions is already registered');
  });
});
