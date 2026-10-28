'use client';

import { useState } from 'react';
import {
  type Cents,
  compareRate,
  formatRate,
  formatUsd,
  GatewayError,
  type Rate,
  parseCents,
  parseRate,
} from '@fa/contracts';
import { type Column, DataTable } from '@/shared/ui/data-table';

interface StandRow {
  id: string;
  bank: string;
  minDeposit: Cents;
  apy: Rate;
}

// Synthetic: equal values and amounts that sort wrongly as strings ("$9.00" > "$10,000.00").
const ROWS: StandRow[] = [
  { id: 'r1', bank: 'Alder Savings', minDeposit: parseCents('9'), apy: parseRate('0.045') },
  { id: 'r2', bank: 'Birch Bank', minDeposit: parseCents('10,000'), apy: parseRate('0.0450') },
  { id: 'r3', bank: 'Cedar Credit', minDeposit: parseCents('2,500,000'), apy: parseRate('0.1') },
  { id: 'r4', bank: 'Dogwood Direct', minDeposit: parseCents('10,000'), apy: parseRate('0.09') },
];

const COLUMNS: Column<StandRow>[] = [
  {
    id: 'bank',
    header: 'Bank',
    cell: (r) => r.bank,
    compare: (a, b) => a.bank.localeCompare(b.bank),
  },
  {
    id: 'minDeposit',
    header: 'Minimum deposit',
    align: 'end',
    cell: (r) => formatUsd(r.minDeposit),
    compare: (a, b) => a.minDeposit - b.minDeposit,
  },
  {
    id: 'apy',
    header: 'APY',
    align: 'end',
    cell: (r) => formatRate(r.apy),
    compare: (a, b) => compareRate(a.apy, b.apy),
  },
  { id: 'note', header: 'Note', cell: () => 'Synthetic row for the stand' },
];

const getRowId = (r: StandRow): string => r.id;
const OUTAGE = new GatewayError('unavailable', 'stand: outage', true);

export function TableSection() {
  const [hideApy, setHideApy] = useState(false);
  return (
    <section aria-labelledby="table" className="space-y-6">
      <h2 id="table" className="text-xl font-semibold">
        DataTable
      </h2>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={hideApy}
          onChange={(e) => {
            setHideApy(e.currentTarget.checked);
          }}
        />
        Hide APY column
      </label>
      <DataTable
        caption="Savings accounts (synthetic)"
        columns={COLUMNS}
        rows={ROWS}
        getRowId={getRowId}
        hiddenColumnIds={hideApy ? ['apy'] : []}
        renderExpanded={(r) => `Details for ${r.bank}`}
      />
      <DataTable
        caption="Loading table"
        columns={COLUMNS}
        rows={[]}
        getRowId={getRowId}
        status="loading"
      />
      <DataTable
        caption="Empty table"
        columns={COLUMNS}
        rows={[]}
        getRowId={getRowId}
        status="empty"
        emptyTitle="No accounts match these filters"
      />
      <DataTable
        caption="Failed table"
        columns={COLUMNS}
        rows={[]}
        getRowId={getRowId}
        status="error"
        error={OUTAGE}
      />
    </section>
  );
}
