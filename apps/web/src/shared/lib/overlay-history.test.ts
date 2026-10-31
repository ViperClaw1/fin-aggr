import { describe, expect, it } from 'vitest';
import { createOverlayHistory } from './overlay-history';

describe('createOverlayHistory', () => {
  it('pushes the first open and replaces a change while open', () => {
    const history = createOverlayHistory();
    expect(history.open(true)).toBe('push');
    expect(history.open(false)).toBe('replace');
  });

  it('steps back over an entry this tab pushed', () => {
    const history = createOverlayHistory();
    history.open(true);
    expect(history.close(true)).toBe('back');
    expect(history.close(false)).toBe('stay');
  });

  it('replaces when the overlay arrived already open', () => {
    const history = createOverlayHistory();
    expect(history.close(true)).toBe('replace');
  });
});
