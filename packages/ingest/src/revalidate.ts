import { formatIssueCreated } from './policy';

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
