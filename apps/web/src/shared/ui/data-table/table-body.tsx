'use client';

import { Fragment, useEffect, useRef } from 'react';
import type { Column, DataTableProps } from './types';
import { sortRows, type SortState } from './sort';

const alignClass = (align: Column<unknown>['align']): string =>
  align === 'end' ? 'text-right' : 'text-left';

export interface BodyProps<T> extends DataTableProps<T> {
  idPrefix: string;
  visible: Column<T>[];
  sort: SortState | null;
  emphasis: string | null;
  expanded: ReadonlySet<string>;
  onToggle: (id: string) => void;
}

function rowIdFromClick(event: MouseEvent): string | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  if (target.closest('a, button, input, select, textarea, summary, label') !== null) return null;
  return target.closest('tr')?.getAttribute('data-row-id') ?? null;
}

function orderedRows<T>(p: BodyProps<T>): readonly T[] {
  const columnId = p.sort === null ? null : p.sort.columnId;
  const compare = p.visible.find((column) => column.id === columnId)?.compare;
  if (p.sort === null || compare === undefined) return p.rows;
  return sortRows(p.rows, compare, p.sort.direction, p.getRowId);
}

export function Body<T>(p: BodyProps<T>) {
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const expandOnRowClick = p.expandOnRowClick === true;
  const onToggle = p.onToggle;
  useEffect(() => {
    const body = bodyRef.current;
    if (body === null || !expandOnRowClick) return undefined;
    const onClick = (event: MouseEvent) => {
      const id = rowIdFromClick(event);
      if (id !== null) onToggle(id);
    };
    body.addEventListener('click', onClick);
    return () => {
      body.removeEventListener('click', onClick);
    };
  }, [expandOnRowClick, onToggle]);

  const rows = orderedRows(p);
  let shown = 0;
  return (
    <tbody ref={bodyRef}>
      {rows.map((row) => {
        const id = p.getRowId(row);
        const isHidden = p.hiddenRowIds?.has(id) === true;
        const below =
          !isHidden && p.contentVisibilityAfter !== undefined && shown >= p.contentVisibilityAfter;
        if (!isHidden) shown += 1;
        const open = p.renderExpanded !== undefined && p.expanded.has(id);
        return (
          <DataRow
            key={id}
            row={row}
            id={id}
            isHidden={isHidden}
            below={below}
            open={open}
            detailsId={`${p.idPrefix}-${id}-details`}
            body={p}
          />
        );
      })}
    </tbody>
  );
}

function DataRow<T>(props: {
  row: T;
  id: string;
  isHidden: boolean;
  below: boolean;
  open: boolean;
  detailsId: string;
  body: BodyProps<T>;
}) {
  const { row, body } = props;
  const extra = body.rowClassName?.(row) ?? '';
  const clickable = body.expandOnRowClick === true ? ' cursor-pointer' : '';
  return (
    <Fragment>
      <tr
        hidden={props.isHidden}
        data-row-id={props.id}
        className={`group border-b border-divider${props.below ? ' cv-below' : ''} ${extra}${clickable}`}
      >
        {body.visible.map((column, index) => (
          <DataCell
            key={column.id}
            column={column}
            row={row}
            first={index === 0}
            emphasis={body.emphasis === column.id}
            open={props.open}
            detailsId={props.detailsId}
            body={body}
            onToggle={() => {
              body.onToggle(props.id);
            }}
          />
        ))}
      </tr>
      {props.open && body.renderExpanded !== undefined ? (
        <tr id={props.detailsId} hidden={props.isHidden} className="border-b border-divider">
          <td colSpan={body.visible.length} className="bg-surface px-3 py-4">
            <div className="sticky left-3 max-w-[calc(100cqw-1.5rem)]">
              {body.renderExpanded(row)}
            </div>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

function DataCell<T>(props: {
  column: Column<T>;
  row: T;
  first: boolean;
  emphasis: boolean;
  open: boolean;
  detailsId: string;
  body: BodyProps<T>;
  onToggle: () => void;
}) {
  const wrap = props.first ? 'w-40 min-w-40 sm:w-auto sm:whitespace-nowrap' : 'whitespace-nowrap';
  const tint = props.emphasis ? 'bg-(--net-cell)' : 'group-hover:bg-surface';
  const cls = `px-3 py-2 ${wrap} ${tint} ${alignClass(props.column.align)}`;
  if (!props.first) {
    return <td className={cls}>{props.column.cell(props.row)}</td>;
  }
  const label = props.body.expandLabel;
  const name = label === undefined ? '' : `: ${label(props.row)}`;
  return (
    <th scope="row" className={`sticky left-0 z-(--z-sticky) bg-background font-normal ${cls}`}>
      <div className="flex items-start gap-2">
        {props.body.renderExpanded === undefined ? null : (
          <ExpandButton
            open={props.open}
            controls={props.detailsId}
            label={`${props.open ? 'Hide' : 'Show'} details${name}`}
            onClick={props.onToggle}
          />
        )}
        <div className="min-w-0">{props.column.cell(props.row)}</div>
      </div>
    </th>
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
