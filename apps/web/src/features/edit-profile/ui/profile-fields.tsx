'use client';

// The profile fields. Text fields write on blur, selects on change; an emptied field is cleared.
// `name` is the ?profile=<field> value, so the form can focus the field it was opened on.
import { FILING_STATUS_LABEL, formatUsd, RESIDENCY_LABEL, type ProfileDraft } from '@fa/contracts';
import { DEFAULT_SCENARIO } from '@/entities/profile';
import { MoneyInput, PercentInput, StateSelect } from '@/shared/ui/inputs';
import { ChoiceField, WholeNumberField } from './fields';

interface ProfileFieldsProps {
  draft: ProfileDraft;
  write: (patch: ProfileDraft) => void;
}

export function ProfileFields({ draft, write }: ProfileFieldsProps) {
  return (
    <>
      <ChoiceField
        label="Filing status"
        name="filingStatus"
        labels={FILING_STATUS_LABEL}
        value={draft.filingStatus}
        onChange={(filingStatus) => {
          write({ filingStatus });
        }}
      />
      <StateSelect
        label="State of residence"
        name="stateCode"
        value={draft.stateCode ?? ''}
        onChange={(code) => {
          write({ stateCode: code === '' ? undefined : code });
        }}
      />
      <MoneyInput
        label="Taxable income"
        name="taxableIncome"
        hint="Per year, before the interest you compare here."
        defaultValue={draft.taxableIncome}
        onValueChange={(v) => {
          write({ taxableIncome: v ?? undefined });
        }}
      />
      <PercentInput
        label="City income tax rate, %"
        name="cityMarginalRate"
        hint="Leave empty if your city has no income tax."
        defaultValue={draft.cityMarginalRate}
        onValueChange={(v) => {
          write({ cityMarginalRate: v ?? undefined });
        }}
      />
      <ChoiceField
        label="Residency"
        name="residency"
        labels={RESIDENCY_LABEL}
        value={draft.residency}
        onChange={(residency) => {
          write({ residency });
        }}
      />
      <WholeNumberField
        label="Age"
        name="age"
        hint="Optional. Some products have age limits."
        defaultValue={draft.age}
        onValueChange={(v) => {
          write({ age: v ?? undefined });
        }}
      />
      <MoneyInput
        label="Amount to deposit"
        name="principal"
        hint={`Leave empty to use ${formatUsd(DEFAULT_SCENARIO.principal)}.`}
        defaultValue={draft.scenario?.principal}
        onValueChange={(v) => {
          write({ scenario: { principal: v ?? undefined } });
        }}
      />
      <WholeNumberField
        label="Holding period, months"
        name="holdingMonths"
        hint={`Leave empty to use ${String(DEFAULT_SCENARIO.holdingMonths)} months.`}
        defaultValue={draft.scenario?.holdingMonths}
        onValueChange={(v) => {
          write({ scenario: { holdingMonths: v ?? undefined } });
        }}
      />
    </>
  );
}
