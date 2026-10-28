'use client';

import { useState } from 'react';
import { type Cents, type Rate } from '@fa/contracts';
import { MoneyInput, PercentInput, StateSelect } from '@/shared/ui/inputs';

export function InputsSection() {
  const [balance, setBalance] = useState<Cents | null>(null);
  const [fee, setFee] = useState<Cents | null>(null);
  const [rate, setRate] = useState<Rate | null>(null);
  const [state, setState] = useState('');
  return (
    <section aria-labelledby="inputs" className="space-y-4">
      <h2 id="inputs" className="text-xl font-semibold">
        Inputs
      </h2>
      <MoneyInput label="Balance" hint="US dollars" onValueChange={setBalance} />
      <MoneyInput label="Fee or refund" allowNegative onValueChange={setFee} />
      <PercentInput label="City tax rate" hint="Percent, e.g. 3.876" onValueChange={setRate} />
      <StateSelect label="State of residence" value={state} onChange={setState} />
      <output data-testid="input-values" className="block font-mono text-sm text-muted">
        {JSON.stringify({ balance, fee, rate, state })}
      </output>
    </section>
  );
}
