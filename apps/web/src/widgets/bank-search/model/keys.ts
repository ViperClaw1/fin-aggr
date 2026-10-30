// URL keys of the bank list. Kept out of the nuqs module so a server page can import the widget
// barrel without evaluating createParser (that call is client-only).
export const BANK_SEARCH_KEYS = ['bank', 'bankKind'] as const;
