// A profile file the user picked: checked for size before it is read, so a huge file is never
// loaded into memory. Messages name the problem only, never the file's values (it may hold income).
import { MAX_IMPORT_BYTES, parseImport, type ImportResult } from '@/entities/profile';

type ImportError = Extract<ImportResult, { ok: false }>['error'];

export const IMPORT_ERROR_MESSAGES: Record<ImportError, string> = {
  too_large: `The file is larger than ${String(MAX_IMPORT_BYTES / 1024)} KB. Pick a profile file exported from this site.`,
  invalid_json: 'The file is not a profile file exported from this site.',
  wrong_format: 'The file is not a profile file exported from this site.',
  unsupported_version: 'The file was exported by a newer version of this site.',
  invalid_profile: 'The file has values this site does not accept.',
  unavailable: 'The profile could not be checked right now. Reload the page and try again.',
};

export async function importFile(
  file: Pick<File, 'size' | 'text'>,
  parse: (text: string) => Promise<ImportResult> = parseImport,
): Promise<ImportResult> {
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, error: 'too_large', issues: [] };
  return parse(await file.text());
}
