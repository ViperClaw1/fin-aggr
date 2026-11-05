// Which catalog rows a filter hides. The rows stay mounted; only the attribute changes
// (ADR-016 D1, step 2.9).

/** Visible product rows before `content-visibility: auto`. About one phone screen. */
export const CONTENT_VISIBILITY_AFTER = 8;

export function hiddenProductIds(
  rows: readonly { id: string; group: string | null }[],
  matched: ReadonlySet<string>,
  hide: 'ineligible' | null,
): Set<string> {
  const hidden = new Set<string>();
  for (const row of rows) {
    if (!matched.has(row.id) || (hide === 'ineligible' && row.group === 'ineligible')) {
      hidden.add(row.id);
    }
  }
  return hidden;
}
