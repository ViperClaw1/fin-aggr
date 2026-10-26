// expect: no-restricted-properties Decimal is never
export const n = (d: { toNumber: () => number }): number => d.toNumber();
