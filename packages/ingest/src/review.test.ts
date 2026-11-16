import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commandOf } from './args';
import { formatDecision, issueNotSynced, syncPrivateIssue } from './cli';
import {
  approveReview,
  enqueueReview,
  rejectReview,
  reopenReview,
  supersededBy,
  type Sql,
} from './decisions';
import { closeReviewIssue, createReviewIssue, reopenReviewIssue } from './github';
import { mentionOverdue } from './overdue';
import { formatIssueCreated, requireReviewer } from './policy';

function scripted(step: (text: string) => Record<string, unknown>[]): Sql & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    query: (text) => {
      calls.push(text.trim().split('\n')[0] ?? text);
      return Promise.resolve({ rows: step(text) });
    },
  };
}

describe('review decisions', () => {
  it('names the version that closes an open review', () => {
    expect(supersededBy(17)).toBe('superseded by version 17');
  });

  it('rejects an email and accepts a GitHub login', () => {
    expect(requireReviewer('ViperClaw1')).toBe('ViperClaw1');
    expect(() => requireReviewer('me@example.com')).toThrow(/login/i);
    expect(() => requireReviewer(undefined)).toThrow(/login/i);
  });

  it('rolls the decision back when publish throws', async () => {
    const sql = scripted((text) => (text.includes('returning') ? [{ id: 4 }] : []));
    await expect(
      approveReview(sql, {
        id: 4,
        login: 'ViperClaw1',
        decidedAt: '2026-11-06T00:00:00.000Z',
        publish: () => Promise.reject(new Error('no draft')),
      }),
    ).rejects.toThrow('no draft');
    expect(sql.calls[0]).toBe('begin');
    expect(sql.calls.at(-1)).toBe('rollback');
    expect(sql.calls).not.toContain('commit');
  });

  it('reopens a rejected row and keeps both the decision and the reason', async () => {
    const sql = scripted((text) => {
      if (text.includes('where id = $1') && text.includes('decided_by')) {
        return [
          {
            id: 4,
            source_id: 'fdic-national-rates',
            status: 'rejected',
            decided_by: 'ViperClaw1',
            decided_at: '2026-11-06T00:00:00.000Z',
            decision_reason: 'parser returned empty',
            issue_url: 'https://github.com/ViperClaw1/fin-aggr-review/issues/9',
          },
        ];
      }
      if (text.includes("status = 'open'")) return [];
      return [{ id: 4 }];
    });
    const reopened = await reopenReview(sql, {
      id: 4,
      login: 'ViperClaw1',
      reopenedAt: '2026-11-16T00:00:00.000Z',
      reason: 'mistaken',
    });
    expect(reopened.issueUrl).toBe('https://github.com/ViperClaw1/fin-aggr-review/issues/9');
    expect(sql.calls[0]).toBe('begin');
    expect(sql.calls.filter((call) => call.startsWith('insert into review_audit'))).toHaveLength(2);
    expect(sql.calls.some((call) => call.startsWith('update review_queue'))).toBe(true);
    expect(sql.calls.at(-1)).toBe('commit');
  });

  it('refuses to reopen without a reason or while another row is open', async () => {
    const sql = scripted((text) => {
      if (text.includes('decided_by')) {
        return [
          {
            id: 4,
            source_id: 'fdic-national-rates',
            status: 'approved',
            decided_by: 'ViperClaw1',
            decided_at: '2026-11-06T00:00:00.000Z',
            decision_reason: null,
            issue_url: null,
          },
        ];
      }
      return [{ id: 8 }];
    });
    await expect(
      reopenReview(sql, {
        id: 4,
        login: 'ViperClaw1',
        reopenedAt: '2026-11-16T00:00:00.000Z',
        reason: '  ',
      }),
    ).rejects.toThrow(/reason/i);
    expect(sql.calls).toEqual([]);
    await expect(
      reopenReview(sql, {
        id: 4,
        login: 'ViperClaw1',
        reopenedAt: '2026-11-16T00:00:00.000Z',
        reason: 'mistaken',
      }),
    ).rejects.toThrow(/open/);
    expect(sql.calls.at(-1)).toBe('rollback');
  });

  it('parses a reopen command', () => {
    expect(commandOf(['reopen', '4', '--reason', 'mistaken'])).toEqual({
      kind: 'reopen',
      id: 4,
      reason: 'mistaken',
    });
  });

  it('requires a reject reason before writing', async () => {
    const sql = scripted(() => []);
    await expect(
      rejectReview(sql, {
        id: 4,
        login: 'ViperClaw1',
        decidedAt: '2026-11-06T00:00:00.000Z',
        reason: '   ',
      }),
    ).rejects.toThrow(/reason/i);
    expect(sql.calls).toEqual([]);
  });
});

describe('open review row', () => {
  it('updates the open row for a source instead of inserting another', async () => {
    const sql = scripted((text) => {
      if (text.includes('issue_url')) {
        return [{ id: 4, issue_url: 'https://github.com/ViperClaw1/fin-aggr-review/issues/9' }];
      }
      return [];
    });
    const queued = await enqueueReview(sql, {
      sourceId: 'fdic-national-rates',
      domain: 'national_rates',
      snapshotId: 12,
      reason: 'fred_series_missing:NOPE',
    });
    expect(queued).toEqual({
      queueId: 4,
      issueUrl: 'https://github.com/ViperClaw1/fin-aggr-review/issues/9',
    });
    expect(sql.calls.some((call) => call.startsWith('insert'))).toBe(false);
    expect(sql.calls.some((call) => call.startsWith('update'))).toBe(true);
  });
});

describe('private issue', () => {
  it('returns the issue number and does not put the diff in the error', async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            number: 9,
            html_url: 'https://github.com/ViperClaw1/fin-aggr-review/issues/9',
          }),
          {
            status: 201,
          },
        ),
      )) as typeof fetch;
    const issue = await createReviewIssue(fetchImpl, {
      token: 'secret-token',
      title: 'Review',
      body: 'diff and https://signed.example/raw?token=abc',
    });
    expect(formatIssueCreated(issue.number)).toBe('issue #9 created');
    expect(formatIssueCreated(issue.number)).not.toContain('http');
  });

  it('prints the decision and closes the issue with that reason', async () => {
    const calls: { method: string; url: string; body: string }[] = [];
    const fetchImpl = ((url: string, init?: RequestInit) => {
      calls.push({
        method: init?.method ?? 'GET',
        url,
        body: typeof init?.body === 'string' ? init.body : '',
      });
      return Promise.resolve(new Response('{}', { status: 200 }));
    }) as typeof fetch;
    expect(formatDecision(4, 'rejected', 'ViperClaw1')).toBe('review 4 rejected by ViperClaw1');
    expect(formatDecision(4, 'approved', 'ViperClaw1')).toBe('review 4 approved by ViperClaw1');
    await closeReviewIssue(fetchImpl, {
      token: 'secret-token',
      issueNumber: 9,
      body: 'rejected by ViperClaw1: parser returned empty',
    });
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toContain('/issues/9/comments');
    expect(calls[0]?.body).toContain('rejected by ViperClaw1: parser returned empty');
    expect(calls[1]?.method).toBe('PATCH');
    expect(JSON.parse(calls[1]?.body ?? '{}')).toMatchObject({ state: 'closed' });
    calls.length = 0;
    await reopenReviewIssue(fetchImpl, {
      token: 'secret-token',
      issueNumber: 9,
      body: 'reopened by ViperClaw1: mistaken',
    });
    expect(calls[0]?.body).toContain('reopened by ViperClaw1: mistaken');
    expect(JSON.parse(calls[1]?.body ?? '{}')).toEqual({ state: 'open' });
  });

  it('warns instead of failing when the review token is missing', async () => {
    const warnings: string[] = [];
    await syncPrivateIssue(
      {},
      {
        issueUrl: 'https://github.com/ViperClaw1/fin-aggr-review/issues/9',
        body: 'rejected by ViperClaw1: empty',
        action: 'closed',
      },
      (line) => warnings.push(line),
    );
    expect(warnings).toEqual([issueNotSynced('closed')]);
    expect(issueNotSynced('closed')).toBe('REVIEW_REPO_TOKEN is missing; the issue was not closed');
    warnings.length = 0;
    await syncPrivateIssue({}, { issueUrl: null, body: 'reopened', action: 'reopened' }, (line) =>
      warnings.push(line),
    );
    expect(warnings).toEqual([]);
  });

  it('omits the response body from a failure', async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        new Response('signed url https://secret.example', { status: 422 }),
      )) as typeof fetch;
    await expect(
      createReviewIssue(fetchImpl, { token: 'secret-token', title: 'Review', body: 'diff' }),
    ).rejects.toThrow('GitHub issue failed: 422');
  });
});

describe('overdue signal', () => {
  it('mentions the assignee without logging the snapshot link', async () => {
    const lines: string[] = [];
    const comments: string[] = [];
    const sql = scripted((text) => {
      if (text.includes('issue_url')) {
        return [{ id: 5, issue_url: 'https://storage.example/sign/raw?token=secret' }];
      }
      return [{ id: 5 }, { id: 6 }];
    });
    await mentionOverdue(sql, {
      cutoffIso: '2026-11-01T00:00:00.000Z',
      comment: (_issue, body) => {
        comments.push(body);
        return Promise.resolve();
      },
      log: (line) => lines.push(line),
    });
    expect(lines.join('\n')).toBe('open 2\noverdue 1\noverdue #5 has no issue');
    expect(lines.join('\n')).not.toContain('http');
    expect(comments).toEqual([]);
  });
});

describe('public workflow', () => {
  it('does not upload artifacts', () => {
    const yaml = readFileSync(join(process.cwd(), '.github/workflows/review-age.yml'), 'utf8');
    expect(yaml).not.toContain('upload-artifact');
    const source = readFileSync(join(process.cwd(), 'packages/ingest/src/overdue.ts'), 'utf8');
    expect(source).not.toContain('console.log');
    expect(source).not.toContain('signedUrl');
  });
});
