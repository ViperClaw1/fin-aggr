// expect: no-restricted-syntax parseFloat/parseInt
export const n = (s: string): number => Number.parseInt(s, 10);
