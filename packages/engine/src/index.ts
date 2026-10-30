export { EngineError, type EngineErrorCode } from './errors';
export { mulRate, sumCents } from './money';
export type { YieldProduct } from './interest';
export { computeNetYield, type NetYieldInput, type NetYieldResult } from './yield';
export {
  evaluateEligibility,
  productEligibilityRule,
  toEligibilityContext,
  type EligibilityContext,
  type EligibilityResult,
  type RuleTraceNode,
  type Tri,
} from './rules';
export { rankProducts, type RankedProduct } from './rank';
export {
  categoryLimit,
  planCoverage,
  type Allocation,
  type CoverageCandidate,
  type CoverageInput,
  type CoveragePlan,
  type OwnershipCategory,
} from './coverage';
export { allAssumptions } from './assumptions';
