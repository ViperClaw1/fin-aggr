import { afterEach, describe, expect, it } from 'vitest';
import { now, setClock, today } from './clock';

// 2026-03-05T12:00:00 local time, built from parts so the test holds in any time zone
const NOON = new Date(2026, 2, 5, 12, 0, 0).getTime();

afterEach(() => {
  setClock();
});

describe('clock', () => {
  it('returns the fixed time while a test clock is set', () => {
    setClock(NOON);
    expect(now().getTime()).toBe(NOON);
  });
  it('today() is the local calendar date, zero-padded', () => {
    setClock(NOON);
    expect(today()).toBe('2026-03-05');
  });
  it('returns a fresh Date each call, so callers cannot mutate the source', () => {
    setClock(NOON);
    now().setFullYear(1999);
    expect(now().getFullYear()).toBe(2026);
  });
  it('restores the real clock without an argument', () => {
    setClock(NOON);
    setClock();
    expect(now().getFullYear()).toBeGreaterThanOrEqual(2026);
  });
});
