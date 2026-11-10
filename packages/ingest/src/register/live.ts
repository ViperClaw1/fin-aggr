import { pathToFileURL } from 'node:url';
import { documentsUrl, registerEnvelopeProblems } from './documents';

/** One newest FDIC document, or an empty page. The body is not logged. */
export async function checkRegisterShape(fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(documentsUrl('federal-deposit-insurance-corporation', 1), {
    signal: AbortSignal.timeout(30_000),
    headers: { accept: 'application/json' },
  });
  if (!response.ok) return `federal register shape http ${String(response.status)}`;
  const problems = registerEnvelopeProblems(await response.json());
  if (problems.length > 0) return `federal register shape ${problems.join(' ')}`;
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
