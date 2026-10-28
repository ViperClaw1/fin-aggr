import type { Assumption, CalcStep } from '@fa/contracts';
import { useId } from 'react';
import { EditAssumptionButton } from './edit-assumption-button';

interface ExplainMathProps {
  steps: readonly CalcStep[];
  assumptions: readonly Assumption[];
  /** Shows "Edit" next to editable assumptions. */
  onEditAssumption?: (id: string) => void;
  title?: string;
  /** Depends on where it sits: a drawer, a product page. */
  headingLevel?: 2 | 3 | 4;
}

/** Engine texts are shown as is: the UI never builds numbers for a calculation (ADR-013). */
export function ExplainMath({
  steps,
  assumptions,
  onEditAssumption,
  title = 'How this is calculated',
  headingLevel = 3,
}: ExplainMathProps) {
  const id = useId();
  const Heading = `h${String(headingLevel)}` as 'h2' | 'h3' | 'h4';
  return (
    // data-assumption marks a calculated result with its assumptions for the AC-3 e2e check
    <section aria-labelledby={id} className="space-y-4" data-assumption="">
      <Heading id={id} className="text-lg font-semibold">
        {title}
      </Heading>
      <ol className="list-decimal space-y-3 pl-6">
        {steps.map((s) => (
          <Step key={s.id} step={s} />
        ))}
      </ol>
      {assumptions.length === 0 ? null : (
        <div>
          <p className="font-medium">Assumptions</p>
          <ul className="list-disc space-y-1 pl-6">
            {assumptions.map((a) => (
              <li key={a.id}>
                {a.text}
                {a.editable && onEditAssumption ? (
                  <EditAssumptionButton assumption={a} onEdit={onEditAssumption} />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Step({ step }: { step: CalcStep }) {
  const inputs = Object.entries(step.inputs);
  return (
    <li>
      <p>
        {step.label}: <strong className="tabular-nums">{step.result}</strong>
      </p>
      <p className="text-sm text-muted">
        <code className="wrap-break-word">{step.formula}</code>
      </p>
      {inputs.length === 0 ? null : (
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-sm">
          {inputs.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-muted">{key}</dt>
              <dd className="wrap-break-word tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}
