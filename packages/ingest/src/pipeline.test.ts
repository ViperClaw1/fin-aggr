import { describe, expect, it, vi } from 'vitest';
import { decidePublish, runSource, sha256Hex, type PipelinePorts, type Source } from './pipeline';

const bytes = new TextEncoder().encode('snapshot');
const sha256 = sha256Hex(bytes);

function source(
  kind: Source<Uint8Array, { id: string }>['kind'],
  rows: { id: string }[],
): Source<Uint8Array, { id: string }> {
  return {
    id: 'fdic-rates',
    domain: 'products',
    kind,
    fetch: () => Promise.resolve({ sha256, bytes, body: bytes, requestCount: 1 }),
    parse: () => rows,
    validate: (parsed) => ({ clean: parsed, suspicious: [], blocked: null }),
  };
}

function ports(): PipelinePorts<{ id: string }> & {
  commit: ReturnType<typeof vi.fn>;
  revalidate: ReturnType<typeof vi.fn>;
  openIssue: ReturnType<typeof vi.fn>;
  finishJob: ReturnType<typeof vi.fn>;
  notifyFailure: ReturnType<typeof vi.fn>;
} {
  return {
    now: () => '2026-11-06T00:00:00.000Z',
    latestHash: () => Promise.resolve(null),
    saveSnapshot: () => Promise.resolve({ snapshotId: 4 }),
    previousRows: () => Promise.resolve([]),
    commit: vi.fn(() => Promise.resolve({ queueId: null, versionId: 9 })),
    sign: () => Promise.resolve('https://signed.example/raw'),
    openIssue: vi.fn(() => Promise.resolve({ number: 7, url: 'https://github.com/x/y/issues/7' })),
    attachIssue: () => Promise.resolve(),
    finishJob: vi.fn(() => Promise.resolve()),
    revalidate: vi.fn(() => Promise.resolve()),
    notifyFailure: vi.fn(() => Promise.resolve({ number: 8 })),
  };
}

describe('publish or hold', () => {
  it('stops when the hash is unchanged and does not open an issue', async () => {
    const gate = ports();
    gate.latestHash = () => Promise.resolve(sha256);
    const lines: string[] = [];
    const summary = await runSource(source('official_api', [{ id: 'a' }]), gate, (line) =>
      lines.push(line),
    );
    expect(summary).toMatchObject({ status: 'held', issueNumber: null });
    expect(gate.commit.mock.calls).toHaveLength(0);
    expect(lines).toEqual([]);
  });

  it('publishes a clean official batch and revalidates', async () => {
    const gate = ports();
    const lines: string[] = [];
    const summary = await runSource(source('official_api', [{ id: 'a' }]), gate, (line) =>
      lines.push(line),
    );
    expect(summary).toMatchObject({
      status: 'published',
      published: 1,
      queued: 0,
      versionId: 9,
    });
    expect(gate.commit.mock.calls).toEqual([[{ publish: [{ id: 'a' }], queue: null }]]);
    expect(gate.revalidate.mock.calls).toHaveLength(1);
    expect(lines).toEqual([]);
  });

  it('holds a suspicious official batch and logs only the issue number', async () => {
    const gate = ports();
    gate.commit = vi.fn(() => Promise.resolve({ queueId: 12, versionId: null }));
    const rows = source('official_api', [{ id: 'a' }]);
    rows.validate = () => ({
      clean: [],
      suspicious: [{ key: 'a', reasons: ['apy move'] }],
      blocked: null,
    });
    const lines: string[] = [];
    const summary = await runSource(rows, gate, (line) => lines.push(line));
    expect(summary).toMatchObject({ status: 'held', published: 0, issueNumber: 7 });
    expect(gate.revalidate.mock.calls).toHaveLength(0);
    expect(lines).toEqual(['issue #7 created']);
    const body = gate.openIssue.mock.calls[0]?.[0] as { body: string };
    expect(body.body).toContain('apy move');
    expect(body.body).toContain('https://signed.example/raw');
    expect(lines.join('\n')).not.toContain('http');
  });

  it('publishes clean scraped rows and queues the suspicious ones', async () => {
    const gate = ports();
    gate.commit = vi.fn(() => Promise.resolve({ queueId: 3, versionId: 9 }));
    const rows = source('scrape', [{ id: 'ok' }, { id: 'bad' }]);
    rows.validate = (parsed) => ({
      clean: parsed.filter((row) => row.id === 'ok'),
      suspicious: [{ key: 'bad', reasons: ['apy bounds'] }],
      blocked: null,
    });
    await runSource(rows, gate, () => undefined);
    expect(gate.commit.mock.calls).toEqual([
      [
        {
          publish: [{ id: 'ok' }],
          queue: expect.objectContaining({ reason: 'bad: apy bounds' }) as object,
        },
      ],
    ]);
    expect(gate.revalidate.mock.calls).toHaveLength(1);
  });

  it('blocks a batch smaller than half the previous rows', () => {
    expect(
      decidePublish({
        kind: 'scrape',
        clean: [{ id: 'only' }],
        suspicious: [],
        blocked: 'shrunk',
      }),
    ).toEqual({ publish: null, reason: 'shrunk' });
  });

  it('keeps the previous version when fetch throws, and does not log the message', async () => {
    const gate = ports();
    const broken = source('official_api', []);
    broken.fetch = () => Promise.reject(new Error('https://secret.example/raw?token=abc'));
    const lines: string[] = [];
    const summary = await runSource(broken, gate, (line) => lines.push(line));
    expect(summary.status).toBe('failed');
    expect(gate.commit.mock.calls).toHaveLength(0);
    expect(lines).toEqual(['issue #8 created']);
    expect(lines.join('\n')).not.toContain('token');
  });

  it('keeps a published version when revalidate returns 500', async () => {
    const gate = ports();
    gate.revalidate = vi.fn(() => Promise.reject(new Error('revalidate failed: 500')));
    gate.notifyFailure = vi.fn(() => Promise.resolve({ number: 1 }));
    gate.finishJob = vi.fn(() => Promise.resolve());
    const lines: string[] = [];
    const summary = await runSource(source('official_api', [{ id: 'a' }]), gate, (line) =>
      lines.push(line),
    );
    expect(summary).toMatchObject({ status: 'published', versionId: 9, revalidateStatus: 500 });
    expect(gate.finishJob.mock.calls[0]?.[0]).toMatchObject({
      status: 'published',
      errors: [{ stage: 'revalidate', status: 500 }],
    });
    expect(gate.notifyFailure.mock.calls).toEqual([
      ['revalidate failed: 500', 'Revalidate failed after publish'],
    ]);
    expect(lines).toEqual(['issue #1 created']);
  });
});
