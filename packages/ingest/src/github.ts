import { REVIEW_OWNER, REVIEW_REPO, formatIssueCreated } from './policy';

function reviewIssueBody(input: {
  sourceId: string;
  domain: string;
  queueId: number;
  reason: string;
  signedUrl: string;
}): string {
  return [
    `Source: ${input.sourceId}`,
    `Domain: ${input.domain}`,
    `Queue: ${String(input.queueId)}`,
    `Reason: ${input.reason}`,
    `Snapshot (7 days): ${input.signedUrl}`,
    'Mint a fresh link with `pnpm ingest:review <id>`.',
  ].join('\n');
}

export function issueNumberFromUrl(url: string): number | null {
  const match = /\/issues\/(\d+)$/.exec(url);
  const digits = match?.[1];
  if (digits === undefined) return null;
  const number = Number(digits);
  return Number.isSafeInteger(number) ? number : null;
}

function issueFields(payload: unknown): { number: number; url: string } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  if (!('number' in payload) || !('html_url' in payload)) return null;
  const { number, html_url: url } = payload;
  if (typeof number !== 'number' || typeof url !== 'string') return null;
  return { number, url };
}

async function githubPost(
  fetchImpl: typeof fetch,
  token: string,
  path: string,
  body: unknown,
): Promise<{ number: number; url: string }> {
  const response = await fetchImpl(`https://api.github.com/repos/${REVIEW_REPO}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`GitHub issue failed: ${String(response.status)}`);
  const fields = issueFields(await response.json());
  if (fields === null) throw new Error('GitHub issue failed: malformed response');
  return fields;
}

/** Opens one issue. The caller logs `issue #N created` and does not print `body`. */
export async function createReviewIssue(
  fetchImpl: typeof fetch,
  input: { token: string; title: string; body: string },
): Promise<{ number: number; url: string }> {
  return githubPost(fetchImpl, input.token, '/issues', {
    title: input.title,
    body: input.body,
    assignees: [REVIEW_OWNER],
  });
}

export async function commentOnIssue(
  fetchImpl: typeof fetch,
  input: { token: string; issueNumber: number; body: string },
): Promise<void> {
  const response = await fetchImpl(
    `https://api.github.com/repos/${REVIEW_REPO}/issues/${String(input.issueNumber)}/comments`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ body: input.body }),
    },
  );
  if (!response.ok) throw new Error(`GitHub issue failed: ${String(response.status)}`);
}

/** Opens the review issue for a held batch. A failure leaves the queue row and returns null. */
export async function openQueuedIssue(
  source: { id: string; domain: string },
  ports: {
    sign(snapshotId: number): Promise<string>;
    openIssue(input: { title: string; body: string }): Promise<{ number: number; url: string }>;
    attachIssue(queueId: number, issueUrl: string): Promise<void>;
  },
  log: (line: string) => void,
  batch: { snapshotId: number; queueId: number | null; reason: string | null },
): Promise<number | null> {
  if (batch.queueId === null || batch.reason === null) return null;
  try {
    const signedUrl = await ports.sign(batch.snapshotId);
    const issue = await ports.openIssue({
      title: `Review ${source.id}`,
      body: reviewIssueBody({
        sourceId: source.id,
        domain: source.domain,
        queueId: batch.queueId,
        reason: batch.reason,
        signedUrl,
      }),
    });
    await ports.attachIssue(batch.queueId, issue.url);
    log(formatIssueCreated(issue.number));
    return issue.number;
  } catch {
    return null;
  }
}
