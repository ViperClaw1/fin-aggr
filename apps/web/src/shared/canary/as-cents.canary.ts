// expect: no-restricted-syntax Cents and Rate are created
type Cents = number & { readonly b: 1 };
export const c = 1 as Cents;
