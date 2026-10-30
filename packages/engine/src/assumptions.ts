// The assumptions the engine can attach to a result, one copy for the methodology page.
import type { Assumption } from '@fa/contracts';
import { coverageAssumptionCatalog } from './coverage';
import { yieldAssumptionCatalog } from './yield';

export function allAssumptions(): readonly Assumption[] {
  return [...yieldAssumptionCatalog(), ...coverageAssumptionCatalog()];
}
