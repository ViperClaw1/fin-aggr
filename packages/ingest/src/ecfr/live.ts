import { pathToFileURL } from 'node:url';
import { ecfrVersionsProblems, ecfrWatchLine, parseEcfrPart, versionsUrl } from './parts';

const PART = '330';

/**
 * One part, nightly. A new amendment date or section id is `ecfr 330 changed`.
 * That line is the whole report until review rows are written.
 */
export async function checkEcfrPartShape(
  fetchImpl: typeof fetch,
  recordedVersions: unknown,
  recordedStructure: unknown,
): Promise<string> {
  const response = await fetchImpl(versionsUrl(PART), {
    signal: AbortSignal.timeout(30_000),
    headers: { accept: 'application/json' },
  });
  if (!response.ok) return `ecfr ${PART} shape http ${String(response.status)}`;
  const body: unknown = await response.json();
  const problems = ecfrVersionsProblems(body);
  if (problems.length > 0) return `ecfr ${PART} shape ${problems.join(' ')}`;
  try {
    return ecfrWatchLine(
      parseEcfrPart(recordedVersions, recordedStructure),
      parseEcfrPart(body, recordedStructure),
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('ecfr ')) {
      return `ecfr ${PART} shape invalid`;
    }
    throw error;
  }
}

function isDirect(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirect()) {
  process.stderr.write('ecfr shape is run from ingest:live\n');
  process.exitCode = 1;
}
