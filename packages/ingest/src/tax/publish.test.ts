import { describe, expect, it } from 'vitest';
import { publishFederalBrackets } from './publish';

describe('tax table publish', () => {
  it('refuses to publish the 2026 draft', () => {
    expect(() => publishFederalBrackets()).toThrow('second checker');
  });
});
