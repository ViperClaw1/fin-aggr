import { pathToFileURL } from 'node:url';
import { CodedError } from '../fetch-budget';
import { documentsUrl, readRegisterPage } from './documents';

const AGENCY = 'internal-revenue-service';

/** Twenty newest IRS documents. The body is not logged. */
export async function checkRegisterShape(fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(documentsUrl(AGENCY, 20), {
    signal: AbortSignal.timeout(30_000),
    headers: { accept: 'application/json' },
  });
  if (!response.ok) return `federal register shape http ${String(response.status)}`;
  try {
    readRegisterPage(await response.text(), AGENCY);
  } catch (error) {
    if (error instanceof CodedError) return `federal register shape ${error.code}`;
    return 'federal register shape unknown';
  }
  return 'federal register shape ok';
}

function isDirect(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirect()) {
  process.stderr.write('federal register shape is run from ingest:live\n');
  process.exitCode = 1;
}
