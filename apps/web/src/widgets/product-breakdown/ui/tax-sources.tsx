import type { Provenance, TaxTables } from '@fa/contracts';
import type { OpenCitation } from '@/features/open-citation';
import { SourceCitation } from '@/entities/fact';

/** The state's own source, else the shared state source, else the table's (ADR-025). */
export function stateTaxProvenance(tables: TaxTables, stateCode: string): Provenance | null {
  const state = tables.states[stateCode];
  if (state === undefined) return null;
  return state.provenance ?? tables.statesProvenance ?? tables.provenance;
}

/** Where the tax inputs of the after-tax steps come from. The state is the profile's, in the browser. */
export function TaxSources(props: {
  tables: TaxTables;
  stateCode: string | null;
  onOpen: ((ref: OpenCitation) => void) | undefined;
}) {
  const { tables, stateCode } = props;
  const state = stateCode === null ? null : stateTaxProvenance(tables, stateCode);
  const open = props.onOpen === undefined ? {} : { onOpen: props.onOpen };
  return (
    <section className="space-y-2" aria-labelledby="tax-sources">
      <h3 id="tax-sources" className="text-base font-semibold">
        Tax sources
      </h3>
      <dl className="space-y-2 text-sm">
        <div>
          <dt>Federal brackets, {String(tables.taxYear)}</dt>
          <dd>
            <SourceCitation provenance={tables.provenance} {...open} />
          </dd>
        </div>
        {stateCode === null || state === null ? null : (
          <div>
            <dt>
              {stateCode} rate, {String(tables.taxYear)}
            </dt>
            <dd>
              <SourceCitation provenance={state} {...open} />
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}
