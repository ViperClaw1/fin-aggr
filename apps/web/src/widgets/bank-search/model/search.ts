// URL state of the bank list. Keys are not the compare filters' `search` and `kind`: those are
// already owned (app/url-keys). History stays replace, like the other filters.
import { INSTITUTION_KINDS, type Institution } from '@fa/contracts';
import { createParser, debounce, parseAsStringLiteral, useQueryStates } from 'nuqs';

const MAX_SEARCH = 80;

const bank = createParser<string>({
  parse: (value) => {
    const text = value.trim().slice(0, MAX_SEARCH);
    return text === '' ? null : text;
  },
  serialize: (text) => text,
})
  .withDefault('')
  .withOptions({ limitUrlUpdates: debounce(300) });

const bankKind = parseAsStringLiteral(INSTITUTION_KINDS);

const bankSearchParsers = { bank, bankKind };

export const useBankSearch = () => useQueryStates(bankSearchParsers);

export type BankKind = Institution['kind'];

export function filterBanks<T extends { name: string; kind: BankKind }>(
  items: readonly T[],
  query: string,
  kind: BankKind | null,
): T[] {
  const text = query.trim().toLocaleLowerCase('en-US');
  return items.filter((item) => {
    const kindOk = kind === null || item.kind === kind;
    const textOk = text === '' || item.name.toLocaleLowerCase('en-US').includes(text);
    return kindOk && textOk;
  });
}
