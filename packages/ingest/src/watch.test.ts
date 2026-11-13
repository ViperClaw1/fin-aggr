import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fingerprintOf } from './content-hash';
import { ecfrWatchSource } from './ecfr/watch';
import { runSource, type PipelinePorts, type Source } from './pipeline';
import { federalRegisterSource } from './register/watch';
import { formatWatchLine, runWatchSource } from './watch';

const versions330 = readFileSync(join(import.meta.dirname, 'ecfr', 'versions-330.json'), 'utf8');
const versions328 = readFileSync(join(import.meta.dirname, 'ecfr', 'versions-328.json'), 'utf8');
const registerDoc = readFileSync(
  join(import.meta.dirname, 'register', 'documents.snapshot.json'),
  'utf8',
);

function gate<Parsed>(): PipelinePorts<Parsed> & {
  commit: ReturnType<
    typeof vi.fn<
      (input: {
        publish: readonly unknown[] | null;
      }) => Promise<{ queueId: number; versionId: null }>
    >
  >;
  revalidate: ReturnType<typeof vi.fn<() => Promise<void>>>;
  saveSnapshot: ReturnType<typeof vi.fn<() => Promise<{ snapshotId: number }>>>;
  openIssue: ReturnType<
    typeof vi.fn<
      (input: { title: string; body: string }) => Promise<{ number: number; url: string }>
    >
  >;
  previousSnapshot: ReturnType<typeof vi.fn<() => Promise<Uint8Array | null>>>;
} {
  return {
    now: () => '2026-11-13T05:00:00.000Z',
    latestHash: () => Promise.resolve(null),
    previousSnapshot: vi.fn(() => Promise.resolve(null)),
    saveSnapshot: vi.fn(() => Promise.resolve({ snapshotId: 4 })),
    previousRows: () => Promise.resolve([]),
    commit: vi.fn((input: { publish: readonly unknown[] | null }) =>
      Promise.resolve({ queueId: 12, versionId: null, seen: input.publish }),
    ),
    sign: () => Promise.resolve('https://signed.example/raw'),
    openIssue: vi.fn((input: { title: string; body: string }) =>
      Promise.resolve({ number: 7, url: 'https://github.com/x/y/issues/7', body: input.body }),
    ),
    attachIssue: () => Promise.resolve(),
    finishJob: () => Promise.resolve(),
    revalidate: vi.fn(() => Promise.resolve()),
    notifyFailure: () => Promise.resolve(null),
  };
}

function jsonResponse(body: string): Response {
  return new Response(body, { status: 200 });
}

describe('watch mode', () => {
  it('stores a baseline and does not open an issue', async () => {
    const ports = gate();
    const source = ecfrWatchSource('330', () => Promise.resolve(jsonResponse(versions330)));
    const summary = await runWatchSource(source, ports, () => undefined);
    expect(summary).toMatchObject({ watch: 'baseline', queued: 0, published: 0, versionId: null });
    expect(formatWatchLine('ecfr-330', 'baseline')).toBe('source ecfr-330 baseline');
    expect(ports.commit.mock.calls).toHaveLength(0);
    expect(ports.revalidate.mock.calls).toHaveLength(0);
    expect(ports.saveSnapshot.mock.calls).toHaveLength(1);
  });

  it('stops when the content hash is unchanged', async () => {
    const ports = gate();
    const source = ecfrWatchSource('330', () => Promise.resolve(jsonResponse(versions330)));
    const first = await source.fetch({
      signal: AbortSignal.timeout(1000),
      requestSignal: () => AbortSignal.timeout(1000),
    });
    ports.latestHash = () => Promise.resolve(first.sha256);
    const summary = await runWatchSource(source, ports, () => undefined);
    expect(summary.watch).toBe('unchanged');
    expect(formatWatchLine(source.id, 'unchanged')).toBe('source ecfr-330 unchanged');
    expect(ports.saveSnapshot.mock.calls).toHaveLength(0);
    expect(ports.commit.mock.calls).toHaveLength(0);
  });

  it('queues one review when the amendment fingerprint changes and does not publish', async () => {
    const ports = gate();
    const baseline = await ecfrWatchSource('330', () =>
      Promise.resolve(jsonResponse(versions330)),
    ).fetch({ signal: AbortSignal.timeout(1000), requestSignal: () => AbortSignal.timeout(1000) });
    const moved = JSON.parse(versions330) as { meta: { latest_amendment_date: string } };
    moved.meta.latest_amendment_date = '2024-04-01';
    const source = ecfrWatchSource('330', () =>
      Promise.resolve(jsonResponse(JSON.stringify(moved))),
    );
    let validated = 0;
    source.validate = () => {
      validated += 1;
      return { clean: [], suspicious: [], blocked: 'watch' };
    };
    ports.latestHash = () => Promise.resolve('a'.repeat(64));
    ports.previousSnapshot = vi.fn(() => Promise.resolve(baseline.bytes));
    const summary = await runWatchSource(source, ports, () => undefined);
    expect(summary).toMatchObject({ watch: 'changed', queued: 1, published: 0, versionId: null });
    expect(formatWatchLine('ecfr-330', 'changed')).toBe('source ecfr-330 changed queued=1');
    expect(formatWatchLine('ecfr-330', 'changed')).not.toContain('Deposit');
    expect(validated).toBe(0);
    expect(ports.revalidate.mock.calls).toHaveLength(0);
    expect(ports.commit.mock.calls[0]?.[0]).toMatchObject({ publish: null });
    const body = String(ports.openIssue.mock.calls[0]?.[0].body);
    expect(body).toContain('Part: 330');
    expect(body).toContain('Date: 2024-04-01');
    expect(body).toContain('Sections:');
    expect(body).toContain(
      'https://www.ecfr.gov/current/title-12/chapter-III/subchapter-B/part-330',
    );
    expect(body).toContain('Recheck the SMDIA and SMSIA quotes');
  });

  it('does not remind part 328 to recheck the insurance limit', async () => {
    const ports = gate();
    const baseline = fingerprintOf('328|2020-01-01|328.1');
    const source = ecfrWatchSource('328', () => Promise.resolve(jsonResponse(versions328)));
    ports.latestHash = () => Promise.resolve('b'.repeat(64));
    ports.previousSnapshot = vi.fn(() => Promise.resolve(baseline.bytes));
    await runWatchSource(source, ports, () => undefined);
    const body = String(ports.openIssue.mock.calls[0]?.[0].body);
    expect(body).toContain('Part: 328');
    expect(body).not.toContain('SMDIA');
  });

  it('treats an empty Federal Register day as unchanged when a snapshot already exists', async () => {
    const ports = gate();
    const previous = fingerprintOf('2026-22495');
    ports.latestHash = () => Promise.resolve('c'.repeat(64));
    ports.previousSnapshot = vi.fn(() => Promise.resolve(previous.bytes));
    const source = federalRegisterSource(() => Promise.resolve(jsonResponse('{"results":[]}')));
    const summary = await runWatchSource(source, ports, () => undefined);
    expect(summary.watch).toBe('unchanged');
    expect(ports.saveSnapshot.mock.calls).toHaveLength(0);
    expect(ports.commit.mock.calls).toHaveLength(0);
    expect(ports.openIssue.mock.calls).toHaveLength(0);
  });

  it('lists only new Federal Register documents', async () => {
    const ports = gate();
    const previous = fingerprintOf('2020-1');
    ports.latestHash = () => Promise.resolve('d'.repeat(64));
    ports.previousSnapshot = vi.fn(() => Promise.resolve(previous.bytes));
    const source = federalRegisterSource(() => Promise.resolve(jsonResponse(registerDoc)));
    const summary = await runWatchSource(source, ports, () => undefined);
    expect(summary.watch).toBe('changed');
    const body = String(ports.openIssue.mock.calls[0]?.[0].body);
    expect(body).toContain('2026-22495');
    expect(body).toContain('https://www.federalregister.gov/');
    expect(formatWatchLine('federal-register', 'changed')).not.toContain('Large-Bank');
    expect(ports.commit.mock.calls[0]?.[0].publish).toBeNull();
  });

  it('refuses to publish a watch source through the publish path', async () => {
    const ports = gate();
    const source: Source<Uint8Array, { id: string }> = {
      id: 'ecfr-330',
      domain: 'reference',
      kind: 'official_api',
      mode: 'watch',
      fetch: () =>
        Promise.resolve({
          sha256: 'ab',
          bytes: new Uint8Array(),
          body: new Uint8Array(),
          requestCount: 1,
        }),
      parse: () => [{ id: '330' }],
      validate: () => ({ clean: [{ id: '330' }], suspicious: [], blocked: null }),
    };
    const summary = await runSource(source, ports, () => undefined);
    expect(summary).toMatchObject({ status: 'failed', published: 0, failure: { code: 'watch' } });
    expect(ports.commit.mock.calls).toHaveLength(0);
    expect(ports.revalidate.mock.calls).toHaveLength(0);
    expect(ports.saveSnapshot.mock.calls).toHaveLength(0);
  });

  it('reports a non-JSON Federal Register page with the agency', async () => {
    const ports = gate();
    let seen = '';
    ports.notifyFailure = (message) => {
      seen = message;
      return Promise.resolve({ number: 6 });
    };
    const source = federalRegisterSource(() =>
      Promise.resolve(new Response('<html></html>', { status: 200 })),
    );
    const summary = await runWatchSource(source, ports, () => undefined);
    expect(summary.failure).toEqual({
      stage: 'parse',
      code: 'json_invalid',
      agency: 'federal-deposit-insurance-corporation',
    });
    expect(seen).toBe('parse json_invalid federal-deposit-insurance-corporation');
    expect(ports.commit.mock.calls).toHaveLength(0);
  });
});
