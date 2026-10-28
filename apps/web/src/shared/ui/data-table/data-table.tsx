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
        // relative: absolutely positioned content (sr-only text) must not escape the scroll box
        className="relative max-h-[70vh] overflow-auto rounded border border-border"
      >
        <table aria-busy={status === 'loading'} className="w-full border-collapse text-sm">
          <caption id={captionId} className="p-2 text-left font-medium">
            {caption}
          </caption>
          <thead>
            <tr>
              {visible.map((c) => (
                <HeaderCell key={c.id} column={c} sort={sort} onSort={onSort} />
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
  sort: SortState | null;
  onSort: (id: string) => void;
}) {
  const { column, sort } = p;
  const base = `sticky top-0 z-10 border-b border-border bg-background px-3 py-2 font-medium whitespace-nowrap ${alignClass(column.align)}`;
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
        className="inline-flex items-center gap-1"
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
            <tr className="border-b border-border">
              {p.visible.map((c, i) => {
                const cls = `px-3 py-2 whitespace-nowrap ${alignClass(c.align)}`;
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
                    className={`sticky left-0 bg-background font-normal ${cls}`}
                  >
                    {p.renderExpanded === undefined ? null : (
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={detailsId}
                        aria-label={open ? 'Hide details' : 'Show details'}
                        onClick={() => {
                          p.onToggle(id);
                        }}
                        className="mr-2"
                      >
                        <span aria-hidden="true">{open ? '−' : '+'}</span>
                      </button>
                    )}
                    {c.cell(row)}
                  </th>
                );
              })}
            </tr>
            {open && p.renderExpanded ? (
              <tr id={detailsId}>
                <td colSpan={p.visible.length} className="bg-background px-3 py-3">
                  {p.renderExpanded(row)}
                </td>
              </tr>
            ) : null}
          </Fragment>
        );
      })}
    </tbody>
  );
}

function SkeletonRows({ span }: { span: number }) {
  return (
    <tbody>
      {SKELETON_ROWS.map((key, i) => (
        <tr key={key} className="border-b border-border">
          <td colSpan={span} className="px-3 py-2">
            {i === 0 ? <span className="sr-only">Loading</span> : null}
            <div aria-hidden="true" className="h-5 rounded bg-border motion-safe:animate-pulse" />
          </td>
        </tr>
      ))}
    </tbody>
  );
}
