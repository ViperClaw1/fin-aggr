// One history entry per overlay (the profile drawer, the citation viewer). Opening from a closed
// state pushes; a change while it is open replaces, so Back closes the overlay instead of undoing
// the change. Closing steps back over an entry this tab pushed. An overlay that arrived open (a
// link, a reload) has nothing to step over, so closing replaces the URL. Each overlay keeps its
// own instance: one per tab, like the history it describes.
export type OverlayHistoryMode = 'push' | 'replace';
export type OverlayClose = 'back' | 'replace' | 'stay';

export function createOverlayHistory(): {
  open: (closed: boolean) => OverlayHistoryMode;
  close: (open: boolean) => OverlayClose;
} {
  let pushed = false;
  return {
    open(closed) {
      if (closed) pushed = true;
      return closed ? 'push' : 'replace';
    },
    close(open) {
      if (!open) {
        pushed = false;
        return 'stay';
      }
      if (pushed) {
        pushed = false;
        return 'back';
      }
      return 'replace';
    },
  };
}
