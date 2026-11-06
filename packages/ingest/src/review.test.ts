import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { approveReview, rejectReview, type Sql } from './decisions';
import { createReviewIssue } from './github';
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
