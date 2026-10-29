/** Age and months: up to three digits. Empty text clears the field; the store checks the range. */
export type WholeNumberResult = { ok: true; value: number | null } | { ok: false };

export function parseWholeNumber(text: string): WholeNumberResult {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  return /^\d{1,3}$/.test(trimmed) ? { ok: true, value: Number(trimmed) } : { ok: false };
}
