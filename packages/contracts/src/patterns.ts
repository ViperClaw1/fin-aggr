// Brand patterns, no imports: both the zod schemas and the zod-free checks use them (ADR-016 D3),
// so each rule is written once and neither side depends on the other.

/** Rate: 0 ≤ r ≤ 1, up to 8 decimals, trailing zeros allowed ("0.0400"). */
export const RATE_RE = /^(0(\.\d{1,8})?|1(\.0{1,8})?)$/;
/** SignedRate: unbounded, up to 8 decimals, no "-0". */
export const SIGNED_RATE_RE = /^(?!-0(\.0+)?$)-?(0|[1-9]\d*)(\.\d{1,8})?$/;
/** Opaque identifier: "fdic:628", "prod_cd_0042". */
export const ID_RE = /^[a-z0-9][a-z0-9:_-]{0,63}$/i;
