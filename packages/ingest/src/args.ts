export type ReviewCommand =
  | { kind: 'review'; id: number | null }
  | { kind: 'approve'; id: number; minutes: number | null }
  | { kind: 'publish-approved'; id: number }
  | { kind: 'revalidate'; domain: string }
  | { kind: 'reject'; id: number; reason: string | undefined }
  | { kind: 'reopen'; id: number; reason: string | undefined };

function reviewId(text: string | undefined, required: boolean): number | null {
  if (text === undefined || text === '') {
    if (required) throw new Error('A review id is required');
    return null;
  }
  if (!/^[1-9]\d*$/.test(text)) throw new Error('A review id is required');
  const id = Number(text);
  if (!Number.isSafeInteger(id)) throw new Error('A review id is required');
  return id;
}

/** `--minutes N`: whole person-minutes, 0–600. Absent: not recorded. */
function minutesOf(argv: readonly string[]): number | null {
  const index = argv.indexOf('--minutes');
  if (index === -1) return null;
  const text = argv[index + 1] ?? '';
  if (!/^\d{1,3}$/.test(text) || Number(text) > 600) {
    throw new Error('--minutes is a whole number from 0 to 600');
  }
  return Number(text);
}

function reasonOf(argv: readonly string[]): string | undefined {
  const index = argv.indexOf('--reason');
  if (index === -1) return undefined;
  return argv[index + 1];
}

/** `review [id]`, `approve <id>`, `reject <id> --reason <text>`, `reopen <id> --reason <text>`. */
export function commandOf(argv: readonly string[]): ReviewCommand {
  const [kind, idText, ...rest] = argv;
  if (kind === 'review') return { kind, id: reviewId(idText, false) };
  if (kind === 'approve') {
    return { kind, id: reviewId(idText, true) ?? 0, minutes: minutesOf(rest) };
  }
  if (kind === 'publish-approved') return { kind, id: reviewId(idText, true) ?? 0 };
  if (kind === 'revalidate' && idText !== undefined && /^[a-z_]+$/.test(idText)) {
    return { kind, domain: idText };
  }
  if (kind === 'reject' || kind === 'reopen')
    return { kind, id: reviewId(idText, true) ?? 0, reason: reasonOf(rest) };
  throw new Error(
    'usage: review [id] | approve <id> | publish-approved <id> | revalidate <domain> | reject <id> --reason <text> | reopen <id> --reason <text>',
  );
}
