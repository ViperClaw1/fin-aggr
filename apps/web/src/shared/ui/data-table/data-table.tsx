'use client';

import { Fragment, useId, useState, type ReactNode } from 'react';
import { EmptyState, ErrorState } from '../states';
import { nextSort, resolveSort, sortRows, type SortState } from './sort';

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
  /** Hidden columns are not rendered at all. */
  hiddenColumnIds?: readonly string[];
  renderExpanded?: (row: T) => ReactNode;
  /** Names the row in its expand button ("Show details: Birch Bank"); pass it with renderExpanded. */
  expandLabel?: (row: T) => string;
  /** Controlled expansion: pass both. */
  expandedIds?: ReadonlySet<string>;
  onExpandedChange?: (ids: ReadonlySet<string>) => void;
}

const SKELETON_ROWS = ['s1', 's2', 's3', 's4', 's5'];
const ARROW = { asc: '▲', desc: '▼' } as const;
const alignClass = (align: Column<unknown>['align']): string =>
  align === 'end' ? 'text-right' : 'text-left';

export function DataTable<T>(props: DataTableProps<T>) {
  const { caption, columns, hiddenColumnIds = [], defaultSort = null, status = 'ready' } = props;
  const captionId = useId();
  const [ownSort, setOwnSort] = useState<SortState | null>(defaultSort);
  const [ownExpanded, setOwnExpanded] = useState<ReadonlySet<string>>(new Set());

  const visible = columns.filter((c) => !hiddenColumnIds.includes(c.id));
  const sortable = (id: string): boolean => visible.some((c) => c.id === id && c.compare);
  const sort = resolveSort(props.sort === undefined ? ownSort : props.sort, defaultSort, sortable);
  const expanded = props.expandedIds ?? ownExpanded;

  const onSort = (columnId: string): void => {
    const next = nextSort(sort, columnId);
    if (props.sort === undefined) setOwnSort(next);
    props.onSortChange?.(next);
  };
  const onToggle = (id: string): void => {
    const next = new Set(expanded);
    if (!next.delete(id)) next.add(id);
    if (props.expandedIds === undefined) setOwnExpanded(next);
    props.onExpandedChange?.(next);
  };

  return (
    <div>
      <div
        role="region"
        aria-labelledby={captionId}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be keyboard-focusable (WCAG 2.1.1, axe scrollable-region-focusable), spec §6 rule 6
        tabIndex={0}
        // No vertical scroll inside the page scroll (E5): the region scrolls sideways only, the
        // first column stays. It never stops clipping: beside a filter sidebar no width is wide
        // enough for every column, and an unclipped table pushes the page sideways.
        // relative: sr-only text must not escape the scroll box.
        className="@container relative overflow-x-auto rounded-lg border border-divider"
      >
        <table aria-busy={status === 'loading'} className="w-full border-collapse text-sm">
          <caption id={captionId} className="px-3 py-3 text-left font-semibold">
            {caption}
          </caption>
          <thead>
            <tr>
              {visible.map((c, i) => (
                <HeaderCell key={c.id} column={c} first={i === 0} sort={sort} onSort={onSort} />
              ))}
            </tr>
          </thead>
          {status === 'ready' ? (
            <Body
              {...props}
              idPrefix={captionId}
              visible={visible}
              sort={sort}
              expanded={expanded}
              onToggle={onToggle}
            />
          ) : null}
          {status === 'loading' ? <SkeletonRows span={visible.length} /> : null}
        </table>
      </div>
      {status === 'empty' ? <EmptyState title={props.emptyTitle ?? 'Nothing to show'} /> : null}
      {status === 'error' ? (
        <ErrorState error={props.error} {...(props.onRetry ? { onRetry: props.onRetry } : {})} />
      ) : null}
    </div>
  );
}

function HeaderCell<T>(p: {
  column: Column<T>;
  /** The first column sticks to the left. */
  first: boolean;
  sort: SortState | null;
  onSort: (id: string) => void;
}) {
  const { column, sort } = p;
  const base = `${p.first ? 'sticky left-0 z-20' : ''} border-y border-divider bg-surface px-3 py-2 text-xs font-medium text-muted whitespace-nowrap ${alignClass(column.align)}`;
  if (column.compare === undefined) {
    return (
      <th scope="col" className={base}>
        {column.header}
      </th>
    );
  }
  const direction = sort?.columnId === column.id ? sort.direction : null;
  const ariaSort = { asc: 'ascending', desc: 'descending' } as const;
  return (
    <th scope="col" aria-sort={direction === null ? 'none' : ariaSort[direction]} className={base}>
      <button
        type="button"
        onClick={() => {
          p.onSort(column.id);
        }}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {column.header}
        <span aria-hidden="true" className={direction === null ? 'text-muted' : ''}>
          {direction === null ? '↕' : ARROW[direction]}
        </span>
      </button>
    </th>
  );
}

function Body<T>(
  p: DataTableProps<T> & {
    idPrefix: string;
    visible: Column<T>[];
    sort: SortState | null;
    expanded: ReadonlySet<string>;
    onToggle: (id: string) => void;
  },
) {
  const compare = p.visible.find((c) => c.id === p.sort?.columnId)?.compare;
  const rows = p.sort && compare ? sortRows(p.rows, compare, p.sort.direction, p.getRowId) : p.rows;
  return (
    <tbody>
      {rows.map((row) => {
        const id = p.getRowId(row);
        const open = p.renderExpanded !== undefined && p.expanded.has(id);
        const detailsId = `${p.idPrefix}-${id}-details`;
        return (
          <Fragment key={id}>
            <tr className="group border-b border-divider">
              {p.visible.map((c, i) => {
                // the sticky first column wraps on phones, or a long name would cover the screen
                const wrap =
                  i === 0 ? 'w-40 min-w-40 sm:w-auto sm:whitespace-nowrap' : 'whitespace-nowrap';
                const cls = `px-3 py-3 ${wrap} group-hover:bg-surface ${alignClass(c.align)}`;
                if (i > 0) {
                  return (
                    <td key={c.id} className={cls}>
                      {c.cell(row)}
                    </td>
                  );
                }
                return (
                  <th
                    key={c.id}
                    scope="row"
                    className={`sticky left-0 z-10 bg-background font-normal ${cls}`}
                  >
                    <div className="flex items-start gap-2">
                      {p.renderExpanded === undefined ? null : (
                        <ExpandButton
                          open={open}
                          controls={detailsId}
                          label={`${open ? 'Hide' : 'Show'} details${p.expandLabel ? `: ${p.expandLabel(row)}` : ''}`}
                          onClick={() => {
                            p.onToggle(id);
                          }}
                        />
                      )}
                      <div className="min-w-0">{c.cell(row)}</div>
                    </div>
                  </th>
                );
              })}
            </tr>
            {open && p.renderExpanded ? (
              <tr id={detailsId} className="border-b border-divider">
                <td colSpan={p.visible.length} className="bg-surface px-3 py-4">
                  {/* as wide as the visible part of the region and pinned to its left edge: on a
                      table wider than the screen the details stay readable without scrolling */}
                  <div className="sticky left-3 max-w-[calc(100cqw-1.5rem)]">
                    {p.renderExpanded(row)}
                  </div>
                </td>
              </tr>
            ) : null}
          </Fragment>
        );
      })}
    </tbody>
  );
}

function ExpandButton(p: { open: boolean; controls: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={p.open}
      aria-controls={p.controls}
      aria-label={p.label}
      onClick={p.onClick}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-border text-muted hover:text-foreground"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={`size-4 transition-transform ${p.open ? 'rotate-180' : ''}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

function SkeletonRows({ span }: { span: number }) {
  return (
    <tbody>
      {SKELETON_ROWS.map((key, i) => (
        <tr key={key} className="border-b border-divider">
          <td colSpan={span} className="px-3 py-2">
            {i === 0 ? <span className="sr-only">Loading</span> : null}
            <div aria-hidden="true" className="h-5 rounded bg-border motion-safe:animate-pulse" />
          </td>
        </tr>
      ))}
    </tbody>
  );
}
