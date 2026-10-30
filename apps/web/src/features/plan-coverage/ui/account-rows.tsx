'use client';

// The account rows. Adding focuses the new bank field; removing returns focus to Add.
import type { Cents } from '@fa/contracts';
import { useRef } from 'react';
import { MoneyInput } from '@/shared/ui/inputs';
import type { AccountDraft, CoverageInstitution } from '../model/use-plan-coverage';

const CATEGORY_LABEL = { single: 'Single', joint: 'Joint' } as const;

interface AccountRowsProps {
  rows: readonly AccountDraft[];
  institutions: readonly CoverageInstitution[];
  onAdd: () => void;
  onRemove: (key: number) => void;
  onChange: (key: number, patch: Partial<Omit<AccountDraft, 'key'>>) => void;
  /** True once, for the row that was just added, so the bank field receives focus. */
  takeFocus: (key: number) => boolean;
}

export function AccountRows({
  rows,
  institutions,
  onAdd,
  onRemove,
  onChange,
  takeFocus,
}: AccountRowsProps) {
  const addRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="flex flex-col gap-4">
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Add an account to see how it fits under the limit.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((row, index) => (
            <AccountRow
              key={row.key}
              row={row}
              index={index}
              institutions={institutions}
              takeFocus={takeFocus(row.key)}
              onRemove={() => {
                onRemove(row.key);
                addRef.current?.focus();
              }}
              onChange={(patch) => {
                onChange(row.key, patch);
              }}
            />
          ))}
        </ul>
      )}
      <button ref={addRef} type="button" className="btn btn-primary self-start" onClick={onAdd}>
        Add an account
      </button>
    </div>
  );
}

function AccountRow({
  row,
  index,
  institutions,
  takeFocus,
  onRemove,
  onChange,
}: {
  row: AccountDraft;
  index: number;
  institutions: readonly CoverageInstitution[];
  takeFocus: boolean;
  onRemove: () => void;
  onChange: (patch: Partial<Omit<AccountDraft, 'key'>>) => void;
}) {
  return (
    <li className="grid gap-3 rounded-sm border border-border p-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Bank
        <select
          ref={(el) => {
            if (el !== null && takeFocus) el.focus();
          }}
          value={row.institutionId ?? ''}
          onChange={(e) => {
            const institutionId =
              institutions.find((inst) => inst.id === e.target.value)?.id ?? null;
            onChange({ institutionId });
          }}
          className="control"
        >
          <option value="">Select a bank</option>
          {institutions.map((inst) => (
            <option key={inst.id} value={inst.id}>
              {inst.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Ownership
        <select
          value={row.category}
          onChange={(e) => {
            const category = e.target.value === 'joint' ? 'joint' : 'single';
            onChange({ category });
          }}
          className="control"
        >
          <option value="single">{CATEGORY_LABEL.single}</option>
          <option value="joint">{CATEGORY_LABEL.joint}</option>
        </select>
      </label>
      <MoneyInput
        label="Amount"
        name={`amount-${String(row.key)}`}
        onValueChange={(amount: Cents | null) => {
          onChange({ amount });
        }}
      />
      <div className="flex items-end">
        <button
          type="button"
          className="btn"
          aria-label={`Remove account ${String(index + 1)}`}
          onClick={onRemove}
        >
          Remove
        </button>
      </div>
    </li>
  );
}
