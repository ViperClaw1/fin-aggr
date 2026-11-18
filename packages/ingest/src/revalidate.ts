import { formatIssueCreated } from './policy';

/** `POST /api/revalidate` on the site, after a publish commits (ADR-019). */
export async function revalidateDomain(env: NodeJS.ProcessEnv, domain: string): Promise<void> {
  const configured = env['NEXT_PUBLIC_SITE_URL']?.trim() ?? '';
  const origin = (configured === '' ? 'https://fin-aggr.vercel.app' : configured).replace(
    /\/$/,
    '',
  );
  const secret = env['REVALIDATE_SECRET']?.trim() ?? '';
  if (secret === '') throw new Error('REVALIDATE_SECRET is missing');
  const response = await fetch(`${origin}/api/revalidate`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify({ domain }),
  });
  if (!response.ok) throw new Error(`revalidate failed: ${String(response.status)}`);
}

/** HTTP status from `revalidate failed: 500`. Zero when the message has no status. */
export async function revalidateOrStatus(revalidate: () => Promise<void>): Promise<number | null> {
  try {
    await revalidate();
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = /^revalidate failed: (\d+)$/.exec(message)?.[1];
    return status === undefined ? 0 : Number(status);
  }
}

/** The version is already stored. The issue is about the cache, not the load. */
export async function reportRevalidate(
  notify: (message: string, title: string) => Promise<{ number: number } | null>,
  log: (line: string) => void,
  status: number,
): Promise<number | null> {
  try {
    const issue = await notify(
      `revalidate failed: ${String(status)}`,
      'Revalidate failed after publish',
    );
    if (issue !== null) log(formatIssueCreated(issue.number));
    return issue?.number ?? null;
  } catch {
    return null;
  }
}
