'use client';

import { useId, useState } from 'react';
import { EmptyState, ErrorState } from '../states';
import { nextSort, resolveSort, type SortState } from './sort';
import { Body } from './table-body';
import type { Column, DataTableProps } from './types';

export type { Column, DataTableProps };

const SKELETON_ROWS = ['s1', 's2', 's3', 's4', 's5'];
const ARROW = { asc: '▲', desc: '▼' } as const;
const alignClass = (align: Column<unknown>['align']): string =>
  align === 'end' ? 'text-right' : 'text-left';

function emphasisColumn(
  explicit: string | null | undefined,
  sort: SortState | null,
): string | null {
  if (explicit !== undefined && explicit !== null) return explicit;
  if (sort === null) return null;
  return sort.columnId;
}

function useTableState<T>(props: DataTableProps<T>) {
  const { defaultSort = null, status = 'ready' } = props;
  const [ownSort, setOwnSort] = useState<SortState | null>(defaultSort);
  const [ownExpanded, setOwnExpanded] = useState<ReadonlySet<string>>(new Set());
  const hidden = props.hiddenColumnIds ?? [];
  const visible = props.columns.filter((column) => !hidden.includes(column.id));
  const sortable = (id: string): boolean =>
    visible.some((column) => column.id === id && column.compare !== undefined);
  const incoming = props.sort === undefined ? ownSort : props.sort;
  const sort = resolveSort(incoming, defaultSort, sortable);
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
  return {
    caption: props.caption,
    status,
    visible,
    sort,
    expanded,
    emphasis: emphasisColumn(props.emphasisColumnId, sort),
    onSort,
    onToggle,
    stickyHeader: Boolean(props.stickyHeader),
    sortDisabled: Boolean(props.sortDisabled),
  };
}

export function DataTable<T>(props: DataTableProps<T>) {
  const captionId = useId();
  const state = useTableState(props);

  return (
    <div>
      <div
        role="region"
        aria-labelledby={captionId}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be keyboard-focusable (WCAG 2.1.1, axe scrollable-region-focusable), spec §6 rule 6
        tabIndex={0}
        // Below xl the region scrolls sideways so the page does not. At xl the header is pinned
        // to the page, and that pin cannot sit inside the scroll box or it covers the first rows.
        className={`@container relative rounded-lg border border-divider ${state.stickyHeader ? 'overflow-x-auto xl:overflow-visible' : 'overflow-x-auto'}`}
      >
        <table
          aria-busy={state.status === 'loading'}
          className="w-full border-collapse font-sans text-sm"
        >
          <caption id={captionId} className="px-3 py-3 text-left font-semibold">
            {state.caption}
          </caption>
          <thead>
            <tr>
              {state.visible.map((column, index) => (
                <HeaderCell
                  key={column.id}
                  column={column}
                  first={index === 0}
                  sort={state.sort}
                  emphasisId={state.emphasis}
                  stickyHeader={state.stickyHeader}
                  onSort={state.onSort}
                  disabled={state.sortDisabled}
                />
              ))}
            </tr>
          </thead>
          {state.status === 'ready' ? (
            <Body
              {...props}
              idPrefix={captionId}
              visible={state.visible}
              sort={state.sort}
              emphasis={state.emphasis}
              expanded={state.expanded}
              onToggle={state.onToggle}
            />
          ) : null}
          {state.status === 'loading' ? <SkeletonRows span={state.visible.length} /> : null}
        </table>
      </div>
      {state.status === 'empty' ? (
        <EmptyState title={props.emptyTitle ?? 'Nothing to show'} />
      ) : null}
      {state.status === 'error' ? (
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
  emphasisId: string | null;
  stickyHeader: boolean;
  onSort: (id: string) => void;
  disabled: boolean;
}) {
  const { column, sort } = p;
  const pin = pinClass(p.first, p.stickyHeader);
  const tint = p.emphasisId === column.id ? 'bg-(--net-header) text-muted' : 'bg-surface';
  const cover = p.stickyHeader
    ? 'xl:before:pointer-events-none xl:before:absolute xl:before:inset-x-0 xl:before:-top-2 xl:before:h-2 xl:before:bg-inherit xl:before:content-[""]'
    : '';
  const base = `${pin} ${cover} border-y border-divider ${tint} px-3 py-2 text-xs font-medium text-muted whitespace-nowrap ${alignClass(column.align)}`;
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
        disabled={p.disabled}
        onClick={() => {
          p.onSort(column.id);
        }}
        className="inline-flex items-center gap-1 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        {column.header}
        <span aria-hidden="true" className={direction === null ? 'text-muted' : ''}>
          {direction === null ? '↕' : ARROW[direction]}
        </span>
      </button>
    </th>
  );
}

function pinClass(first: boolean, stickyHeader: boolean): string {
  if (!first) return stickyHeader ? 'xl:sticky xl:top-32 xl:z-(--z-sticky-corner)' : '';
  const top = stickyHeader ? ' xl:top-32' : '';
  return `sticky left-0 z-(--z-sticky-corner)${top}`;
}

function SkeletonRows({ span }: { span: number }) {
  return (
    <tbody>
      {SKELETON_ROWS.map((key, i) => (
        <tr key={key} className="border-b border-divider">
          <td colSpan={span} className="px-3 py-2">
            {i === 0 ? <span className="sr-only">Loading</span> : null}
            <div
              aria-hidden="true"
              className="h-5 rounded-sm bg-border motion-safe:animate-pulse"
            />
          </td>
        </tr>
      ))}
    </tbody>
  );
}
