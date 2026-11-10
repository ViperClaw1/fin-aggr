import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkEcfrPartShape } from './ecfr/live';
import { checkInstitutionShape } from './fdic/live';
import { checkRegisterShape } from './register/live';

function recorded(name: string): unknown {
  return JSON.parse(readFileSync(join(import.meta.dirname, 'ecfr', name), 'utf8')) as unknown;
}

/** Nightly shape lines. A rules change is `ecfr 330 changed`, not a failed format check. */
export async function checkLiveShapes(fetchImpl: typeof fetch): Promise<string[]> {
  return [
    await checkInstitutionShape(fetchImpl),
    await checkEcfrPartShape(
      fetchImpl,
      recorded('versions-330.json'),
      recorded('structure-330.json'),
    ),
    await checkRegisterShape(fetchImpl),
  ];
}

function succeeded(line: string): boolean {
  return line.endsWith(' ok') || line.endsWith(' unchanged') || line.endsWith(' changed');
}

function isDirect(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirect()) {
  checkLiveShapes(fetch)
    .then((lines) => {
      for (const line of lines) process.stdout.write(`${line}\n`);
      if (lines.some((line) => !succeeded(line))) process.exitCode = 1;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'ingest live shape failed';
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
