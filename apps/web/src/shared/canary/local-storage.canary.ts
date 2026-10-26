// expect: no-restricted-globals persist.ts
export const v = () => localStorage.getItem('x');
