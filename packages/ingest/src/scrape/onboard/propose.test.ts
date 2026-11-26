import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { SALLIE_CONFIG } from '../banks/configs';
import { cleanHtml, ONBOARD_MODEL, proposeAdapter, type ProposedProduct } from './propose';

const PAGE = `<html><head><script>var x = 1;</script></head><body>
<table class="rates"><caption>Certificate of Deposit (CD) rates table showing terms and APYs.</caption>
<tr><th>Terms</th><th>APY</th></tr>
<tr><td>6 months</td><td>3.20% APY</td></tr>
<tr><td>13 months</td><td>4.50% APY</td></tr></table>
<p>The minimum deposit and balance is $2,500, and your returns are guaranteed.</p>
<p>The compounded interest gets credited to your CD monthly.</p>
<p>Certificates of Deposit may change after maturity, applies to personal accounts only, and are accurate as of 11/16/2026.</p>
<p>If your CD has a maturity of twelve (12) months or less, the penalty we impose will equal ninety (90) days’ simple interest on the amount withdrawn subject to penalty.</p>
<p>If your CD has a maturity greater than twelve (12) months, the penalty we impose will equal one hundred eighty (180) days’ simple interest on the amount withdrawn subject to penalty.</p>
</body></html>`;

const bank = {
  institutionId: SALLIE_CONFIG.institutionId,
  bankName: SALLIE_CONFIG.bankName,
  url: SALLIE_CONFIG.url,
  timeZone: SALLIE_CONFIG.timeZone,
};

const { category, name, caption, columns, apy, page } = SALLIE_CONFIG;
const configBody = { category, name, caption, columns, apy, page };

const PRODUCTS: ProposedProduct[] = [
  {
    termMonths: 6,
    apyPercent: '3.20',
    apyQuote: '3.20% APY',
    penaltyDays: 90,
    penaltyQuote: 'ninety (90) days',
    minDollars: '2,500',
    minQuote: 'minimum deposit and balance is $2,500',
  },
  {
    termMonths: 13,
    apyPercent: '4.50',
    apyQuote: '4.50% APY',
    penaltyDays: 180,
    penaltyQuote: 'one hundred eighty (180) days',
    minDollars: '2,500',
    minQuote: 'minimum deposit and balance is $2,500',
  },
];

function reply(answer: unknown, stop: Anthropic.Beta.Messages.BetaStopReason = 'end_turn') {
  const sent: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming[] = [];
  const create = (params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming) => {
    sent.push(params);
    return Promise.resolve({
      model: ONBOARD_MODEL,
      stop_reason: stop,
      content: [{ type: 'text', text: JSON.stringify(answer) }],
      usage: { input_tokens: 1200, output_tokens: 300 },
    } as unknown as Anthropic.Beta.Messages.BetaMessage);
  };
  return { create, sent };
}

const answer = (products: ProposedProduct[], supported = true) => ({
  supported,
  reason: supported ? '' : 'no rate table',
  config: configBody,
  products,
});

describe('proposeAdapter', () => {
  it('passes both checks when the config reads what the model quoted', async () => {
    const { create, sent } = reply(answer(PRODUCTS));
    const proposal = await proposeAdapter({ create, bank, html: PAGE });
    expect(proposal.failures).toEqual([]);
    expect(proposal.config).toMatchObject({ kind: 'html_table', institutionId: 'fdic:58177' });
    expect(proposal.usage).toEqual({ inputTokens: 1200, outputTokens: 300 });
    expect(sent[0]?.model).toBe('claude-opus-5-5');
  });

  it('holds a product whose quote is not on the page', async () => {
    const [first, second] = PRODUCTS;
    if (first === undefined || second === undefined) throw new Error('fixture');
    const { create } = reply(answer([first, { ...second, apyQuote: '4.75% APY' }]));
    const proposal = await proposeAdapter({ create, bank, html: PAGE });
    expect(proposal.failures).toEqual(['quote_not_in_snapshot:13']);
  });

  it('holds a model value the config does not reproduce', async () => {
    const [first, second] = PRODUCTS;
    if (first === undefined || second === undefined) throw new Error('fixture');
    const { create } = reply(answer([first, { ...second, apyPercent: '4.55' }]));
    const proposal = await proposeAdapter({ create, bank, html: PAGE });
    expect(proposal.failures).toEqual(['config_differs_from_model']);
  });

  it('keeps no config when the model says the page is not supported', async () => {
    const { create } = reply(answer([], false));
    const proposal = await proposeAdapter({ create, bank, html: PAGE });
    expect(proposal.config).toBeNull();
    expect(proposal.failures).toEqual(['unsupported:no rate table']);
  });

  it('stops on a refusal instead of reading an empty answer', async () => {
    const { create } = reply(answer(PRODUCTS), 'refusal');
    await expect(proposeAdapter({ create, bank, html: PAGE })).rejects.toThrow('refused');
  });

  it('sends the page without scripts or attributes', () => {
    const html = cleanHtml(PAGE);
    expect(html).not.toContain('var x');
    expect(html).not.toContain('class=');
    expect(html).toContain('<caption>Certificate of Deposit');
  });
});
