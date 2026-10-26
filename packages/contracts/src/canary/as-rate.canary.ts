// expect: no-restricted-syntax Cents and Rate are created
type Rate = string & { readonly b: 1 };
export const r = '0.1' as Rate;
