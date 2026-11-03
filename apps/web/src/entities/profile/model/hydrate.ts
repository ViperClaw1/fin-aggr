// When to load the profile schema (E7 step 2.3). No stored key: do not import() it.
// A stored key: import() after the first paint, so the parse is not a long task on load.

export interface HydrationTarget {
  setState: (partial: { hydrated: boolean }) => void;
  rehydrate: () => Promise<void>;
}

const IDLE_DEADLINE_MS = 2_000;

/** Runs `task` once the browser is idle, or on the next turn where idle callbacks are missing. */
export function scheduleWhenIdle(task: () => void): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(task, { timeout: IDLE_DEADLINE_MS });
    return;
  }
  setTimeout(task, 0);
}

/** Marks the store hydrated immediately when nothing is stored. Otherwise rehydrates from `schedule`. */
export function startProfileHydration(
  target: HydrationTarget,
  stored: boolean,
  schedule: (task: () => void) => void,
): Promise<void> {
  if (!stored) {
    target.setState({ hydrated: true });
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    schedule(() => {
      target.rehydrate().then(resolve, reject);
    });
  });
}
