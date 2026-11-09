import { pathToFileURL } from 'node:url';
import { institutionEnvelopeProblems, institutionsUrl } from './institutions';

/** One row, so a format change fails before the daily directory download. */
export async function checkInstitutionShape(fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(institutionsUrl(0, 1), {
    signal: AbortSignal.timeout(30_000),
    headers: { accept: 'application/json' },
  });
  if (!response.ok) return `fdic institutions shape http ${String(response.status)}`;
  const problems = institutionEnvelopeProblems(await response.json());
  if (problems.length > 0) return `fdic institutions shape ${problems.join(' ')}`;
  return 'fdic institutions shape ok';
}

function isDirect(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirect()) {
  checkInstitutionShape(fetch)
    .then((line) => {
      process.stdout.write(`${line}\n`);
      if (!line.endsWith(' ok')) process.exitCode = 1;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'fdic institutions shape failed';
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
