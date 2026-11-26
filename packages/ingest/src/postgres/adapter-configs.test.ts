import { describe, expect, it } from 'vitest';
import { approveRow, type CliDeps } from '../approve';
import { commandOf } from '../args';
import type { Sql } from '../decisions';
import { asHtmlTableConfig } from '../scrape/banks/config';
import { SALLIE_CONFIG } from '../scrape/banks/configs';
import { activeConfigs, proposalIdOf, proposalReason } from './adapter-configs';

function recording(config: unknown): { sql: Sql; texts: string[] } {
  const texts: string[] = [];
  const sql: Sql = {
    query: (text) => {
      texts.push(text.replace(/\s+/g, ' ').trim());
      if (text.includes('update review_queue')) return Promise.resolve({ rows: [{ id: 7 }] });
      if (text.includes('from adapter_configs')) {
        return Promise.resolve({ rows: [{ id: 3, institution_id: 'fdic:58177', config }] });
      }
      return Promise.resolve({ rows: [] });
    },
  };
  return { sql, texts };
}

const unused: CliDeps = {
  withSql: () => Promise.reject(new Error('not used')),
  snapshot: () => Promise.reject(new Error('not used')),
  revalidate: () => Promise.reject(new Error('not used')),
};

const io = {
  log: () => undefined,
  warn: () => undefined,
  ghLogin: () => Promise.resolve('ViperClaw1'),
  now: () => '2026-11-26T10:00:00.000Z',
};

const review = (reason: string) => ({
  id: 7,
  source_id: 'bank:fdic:58177',
  domain: 'bank_products',
  reason,
  snapshot_id: 11,
  issue_url: null,
});

describe('review minutes', () => {
  it('reads --minutes and refuses a value outside 0–600', () => {
    expect(commandOf(['approve', '7', '--minutes', '4'])).toEqual({
      kind: 'approve',
      id: 7,
      minutes: 4,
    });
    expect(commandOf(['approve', '7'])).toEqual({ kind: 'approve', id: 7, minutes: null });
    expect(() => commandOf(['approve', '7', '--minutes', '601'])).toThrow('--minutes');
    expect(() => commandOf(['approve', '7', '--minutes', 'x'])).toThrow('--minutes');
  });

  it('writes the minutes with the approve decision', async () => {
    const values: unknown[][] = [];
    const base = recording(SALLIE_CONFIG).sql;
    const sql: Sql = {
      query: (text, v) => {
        if (text.includes('update review_queue')) values.push([...(v ?? [])]);
        return base.query(text, v);
      },
    };
    await approveRow({
      sql,
      row: review('adapter_proposal:3'),
      login: 'ViperClaw1',
      io,
      deps: unused,
      minutes: 4,
    });
    expect(values[0]?.[3]).toBe(4);
  });
});

describe('adapter configs', () => {
  it('round-trips the proposal id through the review reason', () => {
    const reason = proposalReason(3, ['config_differs_from_model']);
    expect(reason).toBe('adapter_proposal:3 config_differs_from_model');
    expect(proposalIdOf(reason)).toBe(3);
    expect(proposalIdOf('first_connection')).toBeNull();
  });

  it('accepts the Sallie Mae config and refuses one with a broken pattern', () => {
    expect(asHtmlTableConfig(SALLIE_CONFIG)).toBe(SALLIE_CONFIG);
    expect(() => asHtmlTableConfig({ ...SALLIE_CONFIG, apy: '(' })).toThrow(
      'adapter_config_invalid',
    );
    expect(() => asHtmlTableConfig({ ...SALLIE_CONFIG, url: 'http://x.com' })).toThrow();
  });

  it('skips an invalid stored config instead of running it', async () => {
    const lines: string[] = [];
    const { sql } = recording({ kind: 'html_table' });
    expect(await activeConfigs(sql, (line) => lines.push(line))).toEqual([]);
    expect(lines).toEqual(['adapter_config 3 invalid; skipped']);
  });

  it('approving a proposal retires the old config and activates the new one, publishing nothing', async () => {
    const { sql, texts } = recording(SALLIE_CONFIG);
    const result = await approveRow({
      sql,
      row: review('adapter_proposal:3'),
      login: 'ViperClaw1',
      io,
      deps: unused,
    });
    expect(result).toEqual({ planned: false, versionId: null });
    const retire = texts.findIndex((t) => t.includes("set status = 'retired'"));
    const activate = texts.findIndex((t) => t.includes("set status = 'active'"));
    expect(retire).toBeGreaterThan(-1);
    expect(activate).toBeGreaterThan(retire);
    expect(texts.at(-1)).toBe('commit');
  });
});
