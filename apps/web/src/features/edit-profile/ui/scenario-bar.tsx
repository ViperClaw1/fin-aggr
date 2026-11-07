'use client';

// Deposit and holding period for a complete profile. Writes stay in this feature (ADR-004).
// The bar is one row tall in both states so a saved profile does not move the catalog (ADR-017).
import {
  FILING_STATUS_LABEL,
  formatUsd,
  formatUsdShort,
  type Cents,
  type Profile,
} from '@fa/contracts';
import { useState } from 'react';
import { useCompleteProfile, useProfileActions, type ProfileFormField } from '@/entities/profile';
import { parseMoneyInput } from '@/shared/ui/inputs';
import {
  centsFromDepositSlider,
  clampDepositCents,
  depositSliderFromCents,
} from '../model/deposit-scale';

const HOLDING_MIN = 1;
const HOLDING_MAX = 120;
const BAR =
  'sticky top-16 z-(--z-sticky-corner) flex h-16 items-center border-b border-divider bg-background';

interface ScenarioBarProps {
  taxYear: number;
  onEdit: (field: ProfileFormField) => void;
  editDisabled: boolean;
}

function depositFieldText(cents: Cents): string {
  return formatUsd(cents).replace(/^\$/, '').replace(/\.00$/, '');
}

export function ScenarioBar({ taxYear, onEdit, editDisabled }: ScenarioBarProps) {
  const profile = useCompleteProfile(taxYear);
  if (profile === null) return <EmptyScenario onEdit={onEdit} editDisabled={editDisabled} />;
  return <FilledScenario profile={profile} onEdit={onEdit} editDisabled={editDisabled} />;
}

function EmptyScenario({ onEdit, editDisabled }: Omit<ScenarioBarProps, 'taxYear'>) {
  return (
    <div className={`${BAR} gap-3`}>
      <p className="min-w-0 flex-1 truncate text-sm">
        Add your profile to rank by what you keep after tax
      </p>
      <button
        type="button"
        className="btn btn-sm btn-primary shrink-0"
        disabled={editDisabled}
        onClick={() => {
          onEdit('filingStatus');
        }}
      >
        Add your profile
      </button>
    </div>
  );
}

function FilledScenario({
  profile,
  onEdit,
  editDisabled,
}: {
  profile: Profile;
  onEdit: ScenarioBarProps['onEdit'];
  editDisabled: boolean;
}) {
  const { principal, holdingMonths } = profile.scenario;
  return (
    <div className={BAR}>
      <div className="flex w-full min-w-0 items-center gap-2 lg:hidden">
        <p className="min-w-0 flex-1 truncate font-mono text-sm tabular-nums">
          {formatUsdShort(principal)} · {holdingMonths} mo · {profile.stateCode}
        </p>
        <EditButton editDisabled={editDisabled} onEdit={onEdit} label="Edit" />
      </div>
      <div className="hidden h-full w-full min-w-0 items-center gap-3 overflow-x-auto lg:flex">
        <p className="shrink-0 text-sm text-muted">Your scenario</p>
        <DepositControl principal={principal} />
        <span className="shrink-0 text-sm text-muted">for</span>
        <HoldingControl months={holdingMonths} />
        <p className="min-w-0 shrink truncate text-sm text-muted">
          {profile.stateCode} · {FILING_STATUS_LABEL[profile.filingStatus]}
        </p>
        <EditButton editDisabled={editDisabled} onEdit={onEdit} label="Edit profile" />
      </div>
    </div>
  );
}

function EditButton(props: {
  editDisabled: boolean;
  onEdit: ScenarioBarProps['onEdit'];
  label: string;
}) {
  return (
    <button
      type="button"
      className="btn btn-sm shrink-0"
      disabled={props.editDisabled}
      onClick={() => {
        props.onEdit('filingStatus');
      }}
    >
      {props.label}
    </button>
  );
}

function DepositControl({ principal }: { principal: Cents }) {
  const { update } = useProfileActions();
  const [draft, setDraft] = useState<string | null>(null);
  const write = (cents: Cents) => {
    if (cents !== principal) update({ scenario: { principal: cents } });
  };
  return (
    <>
      <label className="sr-only" htmlFor="scenario-deposit">
        Deposit
      </label>
      <input
        id="scenario-deposit"
        inputMode="decimal"
        placeholder="e.g. 25,000"
        className="control h-8 w-28 shrink-0 font-mono tabular-nums"
        value={draft ?? depositFieldText(principal)}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={() => {
          const parsed = draft === null ? null : parseMoneyInput(draft, false);
          setDraft(null);
          if (parsed?.ok === true && parsed.value !== null) write(clampDepositCents(parsed.value));
        }}
      />
      <input
        type="range"
        min={0}
        max={1000}
        step={1}
        aria-label="Deposit amount"
        aria-valuetext={formatUsd(principal)}
        value={depositSliderFromCents(principal)}
        onChange={(event) => {
          setDraft(null);
          write(centsFromDepositSlider(Number(event.target.value)));
        }}
        className="min-w-0 flex-1"
      />
    </>
  );
}

function HoldingControl({ months }: { months: number }) {
  const { update } = useProfileActions();
  const [draft, setDraft] = useState<string | null>(null);
  const write = (next: number) => {
    if (next !== months) update({ scenario: { holdingMonths: next } });
  };
  return (
    <>
      <label className="sr-only" htmlFor="scenario-holding">
        Holding period
      </label>
      <input
        id="scenario-holding"
        inputMode="numeric"
        placeholder="e.g. 12"
        className="control h-8 w-16 shrink-0 text-center font-mono tabular-nums"
        value={draft ?? String(months)}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={() => {
          const text = draft;
          setDraft(null);
          if (text === null || !/^\d{1,3}$/.test(text)) return;
          const next = Number(text);
          if (next >= HOLDING_MIN && next <= HOLDING_MAX) write(next);
        }}
      />
      <input
        type="range"
        min={HOLDING_MIN}
        max={HOLDING_MAX}
        step={1}
        aria-label="Holding period in months"
        aria-valuetext={`${String(months)} months`}
        value={months}
        onChange={(event) => {
          setDraft(null);
          write(Number(event.target.value));
        }}
        className="w-28 shrink-0"
      />
    </>
  );
}
