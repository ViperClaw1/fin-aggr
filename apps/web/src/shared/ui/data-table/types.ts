import type { ReactNode } from 'react';
import type { SortState } from './sort';

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Ascending comparator; a column without one is not sortable. Cents as integers, Rate via compareRate. */
  compare?: (a: T, b: T) => number;
  align?: 'start' | 'end';
}

export interface DataTableProps<T> {
  /** Required: names the table and its scroll region for assistive technology. */
  caption: string;
  columns: readonly Column<T>[];
  rows: readonly T[];
  getRowId: (row: T) => string;
  status?: 'ready' | 'loading' | 'empty' | 'error';
  /** For `status="error"`; a retryable `GatewayError` gets a retry button. */
  error?: unknown;
  onRetry?: () => void;
  emptyTitle?: string;
  /** Uncontrolled sorting starts here; also the fallback when the sorted column is hidden. */
  defaultSort?: SortState | null;
  /** Controlled sorting: pass both. */
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  /**
   * Sort headers are in the static HTML before their handler exists. Disabled until the caller
   * is hydrated, so an early click is not lost.
   */
  sortDisabled?: boolean;
  /** Hidden columns are not rendered at all. */
  hiddenColumnIds?: readonly string[];
  /**
   * Rows that stay mounted and are not shown. A filter hides them; it does not drop them from
   * `rows`, so the body is not built again (ADR-016 D1, step 2.9).
   */
  hiddenRowIds?: ReadonlySet<string>;
  /**
   * Visible rows at this index and after (0-based, hidden rows are not counted) skip layout
   * until they near the viewport.
   */
  contentVisibilityAfter?: number;
  renderExpanded?: (row: T) => ReactNode;
  /** Names the row in its expand button ("Show details: Birch Bank"); pass it with renderExpanded. */
  expandLabel?: (row: T) => string;
  /** Controlled expansion: pass both. */
  expandedIds?: ReadonlySet<string>;
  onExpandedChange?: (ids: ReadonlySet<string>) => void;
  /** Extra classes on the data row, for example dimming a row the reader cannot open. */
  rowClassName?: (row: T) => string | undefined;
  /** A click on the row toggles its details. Links and controls keep their own action. */
  expandOnRowClick?: boolean;
  /** Header cells stick under the site header. Off elsewhere so a short table does not pin. */
  stickyHeader?: boolean;
  /** Column id to tint. Defaults to the active sort column. */
  emphasisColumnId?: string | null;
}
