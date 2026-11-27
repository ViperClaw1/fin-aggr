import type Anthropic from '@anthropic-ai/sdk';
import { rateFromPercent } from '@fa/contracts';
import * as cheerio from 'cheerio';
import { readTableConfig, type HtmlTableConfig } from '../banks/config';

/**
 * Plan 8.6 (ADR-026, ADR-027): the model reads one stored snapshot and proposes an `html_table`
 * config plus the products it sees, each value with a verbatim quote. Nothing here publishes:
 * the result is a proposal with the outcome of two checks, for the review queue.
 */

export const ONBOARD_MODEL = 'claude-opus-5-5';
/** Bump when the prompt or the schema changes; it is stored on every proposal. */
const PROMPT_VERSION = 'onboard-html-table-1+recheck-1';

export interface ProposedProduct {
  termMonths: number;
  apyPercent: string;
  apyQuote: string;
  penaltyDays: number;
  penaltyQuote: string;
  minDollars: string;
  minQuote: string;
}

type ConfigBody = Omit<HtmlTableConfig, 'kind' | 'institutionId' | 'bankName' | 'url' | 'timeZone'>;

interface ModelAnswer {
  supported: boolean;
  reason: string;
  config: ConfigBody;
  products: ProposedProduct[];
}

export interface Proposal {
  model: string;
  promptVersion: string;
  config: HtmlTableConfig | null;
  products: ProposedProduct[];
  /** Empty when both checks pass. Otherwise the review reasons. */
  failures: string[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface Bank {
  institutionId: string;
  bankName: string;
  url: string;
  timeZone: string;
}

const str = { type: 'string' } as const;
const int = { type: 'integer' } as const;
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const SCHEMA = obj({
  supported: { type: 'boolean' },
  reason: str,
  config: obj({
    category: { type: 'string', enum: ['cd', 'savings'] },
    name: str,
    caption: str,
    columns: obj({ term: int, apy: int }),
    apy: str,
    page: obj({
      asOf: str,
      minDollars: str,
      compounding: obj({ pattern: str, value: { type: 'string', enum: ['daily', 'monthly'] } }),
      penalties: {
        type: 'array',
        items: obj({ maxTermMonths: { anyOf: [int, { type: 'null' }] }, pattern: str }),
      },
    }),
  }),
  products: {
    type: 'array',
    items: obj({
      termMonths: int,
      apyPercent: str,
      apyQuote: str,
      penaltyDays: int,
      penaltyQuote: str,
      minDollars: str,
      minQuote: str,
    }),
  },
});

const SYSTEM = `You onboard a US bank's public CD rate page for a rate comparison site.
You receive the page as cleaned HTML. Propose a configuration that a deterministic reader will run every night, and list the CD products you read yourself.

The reader works like this:
- It takes every <table> whose <caption> text contains config.caption, and every <tr> in it.
- In each row, cell config.columns.term (0-based, th and td alike) holds the term ("12 months"), and cell config.columns.apy holds the APY; config.apy is a JavaScript regular expression source whose group 1 is the APY percent ("4.60").
- Page facts are regular expressions run, case-insensitive, on the page text with whitespace collapsed to single spaces: page.asOf (groups 1-3: month, day, year of the rate date), page.minDollars (group 1: whole dollars, commas allowed), page.compounding.pattern (must match; value is daily or monthly), page.penalties (each pattern's group 1 is the day count; the first band whose maxTermMonths is null or >= the term applies).
- config.name is the product name; {term} is replaced by the term in months.

Rules:
- Every value must come from the page. Each quote must be copied exactly, character for character, from the page text with whitespace collapsed. Never estimate, round or infer a number.
- If the page has no rate table with a caption, no stated rate date, no minimum deposit, no compounding sentence, or no day-count penalty per term, set supported to false and say which in reason. Still fill the other fields with empty strings, zeros and empty arrays.
- List products in table order.`;

function pageText(html: string): string {
  return cheerio.load(html)('body').text().replaceAll(' ', ' ').replace(/\s+/g, ' ').trim();
}

/** Scripts, styles and attributes other than structure removed: what a reader of the page sees. */
export function cleanHtml(html: string): string {
  const page = cheerio.load(html);
  page('script, style, noscript, svg, template, iframe, link, meta').remove();
  page('*').each((_, element) => {
    if ('attribs' in element) element.attribs = {};
  });
  return (page('body').html() ?? '').replace(/\s+/g, ' ');
}

type Create = (
  params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Beta.Messages.BetaMessage>;

function answerOf(message: Anthropic.Beta.Messages.BetaMessage): ModelAnswer {
  if (message.stop_reason === 'refusal') throw new Error('onboard model refused');
  if (message.stop_reason === 'max_tokens') throw new Error('onboard answer was cut off');
  const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : []));
  return JSON.parse(text.join('')) as ModelAnswer;
}

/** term|rate|penalty days|cents, from the model's strings through the contract parsers. */
function modelKey(p: ProposedProduct): string {
  const dollars = p.minDollars.replaceAll(',', '');
  if (!/^\d+$/.test(dollars)) return `invalid:${p.minDollars}`;
  try {
    const cents = BigInt(`${dollars}00`).toString();
    return `${String(p.termMonths)}|${rateFromPercent(p.apyPercent)}|${String(p.penaltyDays)}|${cents}`;
  } catch {
    return `invalid:${p.apyPercent}`;
  }
}

/** ADR-026 check 2: each value is written in its own quote, not only somewhere on the page. */
function valueInQuote(p: ProposedProduct): boolean {
  const days = new RegExp(`(?<!\\d)${String(p.penaltyDays)}(?!\\d)`);
  return (
    p.apyQuote.includes(p.apyPercent) &&
    days.test(p.penaltyQuote) &&
    p.minQuote.includes(p.minDollars)
  );
}

/** Checks 1–3 of ADR-026. Reasons follow the review-queue style `<check>:<detail>`. */
function checkProposal(
  config: HtmlTableConfig,
  products: readonly ProposedProduct[],
  html: string,
): string[] {
  const text = pageText(html);
  const failures: string[] = [];
  for (const p of products) {
    const quotes = [p.apyQuote, p.penaltyQuote, p.minQuote];
    if (quotes.some((quote) => quote === '' || !text.includes(quote))) {
      failures.push(`quote_not_in_snapshot:${String(p.termMonths)}`);
    }
  }
  for (const p of products) {
    if (!valueInQuote(p)) failures.push(`value_not_in_quote:${String(p.termMonths)}`);
  }
  let read: string[];
  try {
    read = readTableConfig(config, html).products.map((row) => {
      const penalty = row.earlyWithdrawal.value;
      const days = penalty.kind === 'days_of_interest' ? penalty.days : 0;
      return `${String(row.termMonths)}|${row.tiers[0]?.apy ?? ''}|${String(days)}|${String(row.minOpening)}`;
    });
  } catch {
    return [...failures, 'config_invalid'];
  }
  const expected = products.map(modelKey);
  if (read.length === 0) failures.push('config_reads_nothing');
  else if (read.join(';') !== expected.join(';')) failures.push('config_differs_from_model');
  return failures;
}

/** ADR-026 check 4 asks for a different prompt: products only, no reader to configure. */
const RECHECK_SYSTEM = `You read a US bank's public CD rate page for a rate comparison site.
List every CD product the page states, in the order the page lists them: term in months, APY percent as written ("4.60"), early withdrawal penalty in days of interest for that term, minimum opening deposit in whole dollars as written ("2,500"). Each quote is copied exactly, character for character, from the page text with whitespace collapsed. Never estimate, round or infer a number.
If the page states no CD rates with a minimum deposit and a day-count penalty, set supported to false, say why in reason, and return no products.`;

const RECHECK_SCHEMA = obj({
  supported: SCHEMA.properties['supported'],
  reason: str,
  products: SCHEMA.properties['products'],
});

function ask(
  input: { create: Create; bank: Bank; html: string },
  recheck: boolean,
): Promise<Anthropic.Beta.Messages.BetaMessage> {
  const schema = recheck ? RECHECK_SCHEMA : SCHEMA;
  return input.create({
    model: ONBOARD_MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'high', format: { type: 'json_schema', schema } },
    system: recheck ? RECHECK_SYSTEM : SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Bank: ${input.bank.bankName}\nURL: ${input.bank.url}\n\n${cleanHtml(input.html)}`,
      },
    ],
  });
}

/** ADR-026 check 4: a second, separate extraction must list the same products. */
function sameProducts(a: ModelAnswer, b: ModelAnswer): boolean {
  return (
    a.supported === b.supported &&
    a.products.map(modelKey).join(';') === b.products.map(modelKey).join(';')
  );
}

export async function proposeAdapter(input: {
  create: Create;
  bank: Bank;
  html: string;
}): Promise<Proposal> {
  const [message, second] = await Promise.all([ask(input, false), ask(input, true)]);
  const answer = answerOf(message);
  const recheck = answerOf(second);
  const usage = {
    inputTokens: message.usage.input_tokens + second.usage.input_tokens,
    outputTokens: message.usage.output_tokens + second.usage.output_tokens,
  };
  const twin = sameProducts(answer, recheck) ? [] : ['second_extraction_differs'];
  const base = {
    model: message.model,
    promptVersion: PROMPT_VERSION,
    products: answer.products,
    usage,
  };
  if (!answer.supported)
    return { ...base, config: null, failures: [`unsupported:${answer.reason.slice(0, 200)}`] };
  const config: HtmlTableConfig = { kind: 'html_table', ...input.bank, ...answer.config };
  return {
    ...base,
    config,
    failures: [...checkProposal(config, answer.products, input.html), ...twin],
  };
}
