// URL state of the product filters (ADR-009: nuqs for filters people share). Parsing never throws:
// an invalid value becomes the default. Output is canonical (sorted, no duplicates, defaults left
// out of the URL), so equal filters give equal links. Never filled from the profile (ADR-004,
// depcruise url-state-never-from-profile).
import {
  formatRate,
  formatUsd,
  InstitutionKind,
  parseCents,
  rateFromPercent,
  compareRate,
  Rate,
  type Cents,
} from '@fa/contracts';
import {
  createLoader,
  createParser,
  createSerializer,
  debounce,
  parseAsStringLiteral,
  type inferParserType,
} from 'nuqs';

const MAX_TERMS = 10;
const MAX_TERM_MONTHS = 600;
const MAX_OPENING_DOLLARS = 10_000_000;
const MAX_SEARCH = 80;

const sameList = <T>(a: readonly T[], b: readonly T[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

const term = createParser<number[]>({
  parse: (value) => {
    const months = value
      .split(',')
      .filter((s) => /^\d{1,3}$/.test(s))
      .map(Number)
      .filter((m) => m >= 1 && m <= MAX_TERM_MONTHS);
    const canonical = [...new Set(months)].sort((a, b) => a - b).slice(0, MAX_TERMS);
    return canonical.length === 0 ? null : canonical;
  },
  serialize: (months) => months.join(','),
  eq: sameList,
}).withDefault([]);

type Kind = (typeof InstitutionKind.options)[number];
const kind = createParser<Kind[]>({
  parse: (value) => {
    const given = new Set(value.split(','));
    const known = InstitutionKind.options.filter((k) => given.has(k));
    return known.length === 0 ? null : known;
  },
  serialize: (kinds) => kinds.join(','),
  eq: sameList,
}).withDefault([]);

/** In the URL as a percent ("4.5"), in the app as a Rate ("0.045"). Zero cuts nothing: default. */
const minApy = createParser<Rate>({
  parse: (value) => {
    if (value.length > 10) return null;
    try {
      const rate = rateFromPercent(value);
      return compareRate(rate, Rate.parse('0')) === 0 ? null : rate;
    } catch {
      return null;
    }
  },
  serialize: (rate) => formatRate(rate).slice(0, -1),
  eq: (a, b) => compareRate(a, b) === 0,
});

/** Whole dollars in the URL ("5000"), Cents in the app. Cents are written rounded down. */
const maxOpening = createParser<Cents>({
  parse: (value) => {
    if (!/^\d{1,8}$/.test(value)) return null;
    const cents = parseCents(value);
    return cents <= parseCents(String(MAX_OPENING_DOLLARS)) ? cents : null;
  },
  serialize: (cents) =>
    formatUsd(cents)
      .replace(/[$,]/g, '')
      .replace(/\.\d{2}$/, ''),
});

/** Plain text, never HTML: React renders it as a string. */
const search = createParser<string>({
  parse: (value) => {
    const text = value.trim().slice(0, MAX_SEARCH);
    return text === '' ? null : text;
  },
  serialize: (text) => text,
})
  .withDefault('')
  .withOptions({ limitUrlUpdates: debounce(300) });

const hide = parseAsStringLiteral(['ineligible'] as const);

/** Filters keep nuqs' default history 'replace': Back does not step through filter edits. */
const productFilterParsers = { term, kind, minApy, maxOpening, search, hide };

export type ProductFilters = inferParserType<typeof productFilterParsers>;
export const PRODUCT_FILTER_KEYS = Object.keys(productFilterParsers) as (keyof ProductFilters)[];
export const loadProductFilters = createLoader(productFilterParsers);
export const productFiltersUrl = createSerializer(productFilterParsers);
