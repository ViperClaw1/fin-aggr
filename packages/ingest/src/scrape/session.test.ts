import { describe, expect, it } from 'vitest';
import { createScrapeSession, type PageRequest, type ScrapeDeps } from './session';

const MAILBOX = 'ops@fin-aggr.example';
const NIGHT = '2026-11-11T08:00:00.000Z';
const ALLOW = 'User-agent: *\nDisallow: /admin\n';

interface Call {
  url: string;
  method: string;
  headers: Headers;
}

function clock(start: string): {
  now(): string;
  sleep(ms: number): Promise<void>;
  waits: number[];
} {
  let current = Date.parse(start);
  const waits: number[] = [];
  return {
    now: () => new Date(current).toISOString(),
    sleep: (ms) => {
      waits.push(ms);
      current += ms;
      return Promise.resolve();
    },
    waits,
  };
}

function scripted(handler: (call: Call) => Response): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    if (typeof input !== 'string') return Promise.reject(new Error('expected a url string'));
    const call = { url: input, method: init?.method ?? 'GET', headers: new Headers(init?.headers) };
    calls.push(call);
    return Promise.resolve(handler(call));
  };
  return { fetch: fetchImpl, calls };
}

function page(over: Partial<PageRequest> = {}): PageRequest {
  return {
    sourceId: 'bank:a',
    url: 'https://www.example.com/rates',
    timeZone: 'America/New_York',
    excluded: false,
    ...over,
  };
}

function session(
  fetchImpl: typeof fetch,
  time = clock(NIGHT),
  log: (line: string) => void = () => undefined,
  onManual?: ScrapeDeps['onManual'],
) {
  const deps: ScrapeDeps = {
    fetch: fetchImpl,
    now: () => time.now(),
    sleep: (ms) => time.sleep(ms),
    log,
  };
  if (onManual !== undefined) deps.onManual = onManual;
  return { client: createScrapeSession(MAILBOX, deps), time };
}

describe('scrape session', () => {
  it('reads robots.txt for the host, then the page, and counts both on the registrable domain', async () => {
    const lines: string[] = [];
    const script = scripted((call) => {
      if (call.url.endsWith('/robots.txt')) return new Response(ALLOW, { status: 200 });
      return new Response('APY 4%', {
        status: 200,
        headers: { etag: '"v1"', 'last-modified': 'Tue, 10 Nov 2026 00:00:00 GMT' },
      });
    });
    const { client } = session(script.fetch, clock(NIGHT), (line) => lines.push(line));
    const result = await client.get(page());
    expect(result).toMatchObject({ kind: 'ok', status: 200, url: 'https://www.example.com/rates' });
    expect(script.calls.map((call) => call.url)).toEqual([
      'https://www.example.com/robots.txt',
      'https://www.example.com/rates',
    ]);
    expect(script.calls[0]?.headers.get('user-agent')).toBe(
      'FA (+https://fin-aggr.vercel.app; ops@fin-aggr.example)',
    );
    expect(script.calls[1]?.headers.get('if-none-match')).toBeNull();
    client.flushLoad();
    const bytes = ALLOW.length + 'APY 4%'.length;
    expect(lines).toEqual([`load example.com requests=2 bytes=${String(bytes)}`]);
    expect(lines.join('\n')).not.toContain(MAILBOX);
  });

  it('sends validators on the next request and stops when the page is unchanged', async () => {
    let pageHits = 0;
    const script = scripted((call) => {
      if (call.url.endsWith('/robots.txt')) return new Response(ALLOW, { status: 200 });
      pageHits += 1;
      if (pageHits === 1) {
        return new Response('APY 4%', {
          status: 200,
          headers: { etag: '"v1"', 'last-modified': 'Tue, 10 Nov 2026 00:00:00 GMT' },
        });
      }
      return new Response(null, { status: 304 });
    });
    const { client } = session(script.fetch);
    await client.get(page());
    const again = await client.get(page());
    expect(again).toEqual({ kind: 'not_modified', url: 'https://www.example.com/rates' });
    const second = script.calls[2];
    expect(second?.headers.get('if-none-match')).toBe('"v1"');
    expect(second?.headers.get('if-modified-since')).toBe('Tue, 10 Nov 2026 00:00:00 GMT');
  });

  it('waits ten seconds per domain even when robots.txt asks for one', async () => {
    const time = clock(NIGHT);
    const script = scripted((call) => {
      if (call.url.endsWith('/robots.txt')) {
        return new Response('User-agent: *\nCrawl-delay: 1\nDisallow:\n', { status: 200 });
      }
      return new Response('APY 4%', { status: 200 });
    });
    const { client } = session(script.fetch, time);
    await client.get(page());
    await client.get(page());
    expect(time.waits).toEqual([10_000, 10_000]);
  });

  it('does not fetch outside the overnight window', async () => {
    const script = scripted(() => {
      throw new Error('fetched');
    });
    const { client } = session(script.fetch, clock('2026-11-11T15:00:00.000Z'));
    await expect(client.get(page())).resolves.toEqual({ kind: 'outside_window' });
    expect(script.calls).toEqual([]);
  });

  it('puts a disallowed path into manual mode and does not fetch it', async () => {
    const reasons: string[] = [];
    const lines: string[] = [];
    const script = scripted(
      () => new Response('User-agent: *\nDisallow: /rates\n', { status: 200 }),
    );
    const { client } = session(
      script.fetch,
      clock(NIGHT),
      (line) => lines.push(line),
      (sourceId, reason) => {
        reasons.push(`${sourceId} ${reason}`);
        return Promise.resolve();
      },
    );
    await expect(client.get(page())).resolves.toEqual({ kind: 'manual', reason: 'robots' });
    expect(script.calls).toHaveLength(1);
    expect(lines).toEqual(['source bank:a manual robots']);
    expect(reasons).toEqual(['bank:a robots']);
  });

  it('stops on a captcha and does not try again', async () => {
    const script = scripted((call) => {
      if (call.url.endsWith('/robots.txt')) return new Response(ALLOW, { status: 200 });
      return new Response('g-recaptcha', { status: 403 });
    });
    const { client } = session(script.fetch);
    await expect(client.get(page())).resolves.toEqual({ kind: 'manual', reason: 'captcha' });
    expect(script.calls).toHaveLength(2);
  });

  it('treats a redirect onto a login page as a block', async () => {
    const script = scripted((call) => {
      if (call.url.endsWith('/robots.txt')) return new Response(ALLOW, { status: 200 });
      return new Response(null, { status: 302, headers: { location: '/login' } });
    });
    const { client } = session(script.fetch);
    await expect(client.get(page())).resolves.toEqual({ kind: 'manual', reason: 'blocked' });
    expect(script.calls.map((call) => call.url)).toEqual([
      'https://www.example.com/robots.txt',
      'https://www.example.com/rates',
    ]);
  });

  it('does not fetch an excluded bank and says when the opt-out was late', async () => {
    const lines: string[] = [];
    const script = scripted(() => {
      throw new Error('fetched');
    });
    const { client } = session(script.fetch, clock(NIGHT), (line) => lines.push(line));
    await expect(
      client.get(
        page({
          excluded: true,
          optOutRequestedAt: '2026-11-10T00:00:00.000Z',
          optOutAppliedAt: '2026-11-11T08:00:00.000Z',
        }),
      ),
    ).resolves.toEqual({ kind: 'excluded', late: true });
    expect(lines).toEqual(['source bank:a excluded late']);
    expect(script.calls).toEqual([]);
  });

  it('clips a fact to a short quote', () => {
    const fetchImpl: typeof fetch = () => Promise.reject(new Error('fetched'));
    const { client } = session(fetchImpl);
    const quote = client.quote(`${'word '.repeat(30)}Done. ${'x '.repeat(200)}`);
    expect(quote.length).toBeLessThanOrEqual(400);
    expect(quote.endsWith('.')).toBe(true);
  });
});
