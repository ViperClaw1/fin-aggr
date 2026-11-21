import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkEcfrPartShape } from './ecfr/live';
import { checkFinancialsShape } from './fdic/financials-fetch';
import { checkInstitutionShape } from './fdic/live';
import { checkRegisterShape } from './register/live';
import { checkNationalRatesShape } from './fred/national';
import { checkNcuaShape } from './ncua/live';
import { checkDirectShape, checkFiscalShape } from './treasury/auctions';
import { checkParYieldShape } from './treasury/live';

function recorded(name: string): unknown {
  return JSON.parse(readFileSync(join(import.meta.dirname, 'ecfr', name), 'utf8')) as unknown;
}

/** Nightly shape lines. A rules change is `ecfr 330 changed`, not a failed format check. */
export async function checkLiveShapes(fetchImpl: typeof fetch): Promise<string[]> {
  return [
    await checkInstitutionShape(fetchImpl),
    await checkFinancialsShape(fetchImpl),
    await checkEcfrPartShape(
      fetchImpl,
      recorded('versions-330.json'),
      recorded('structure-330.json'),
    ),
    await checkRegisterShape(fetchImpl),
    await checkParYieldShape(fetchImpl),
    await checkNcuaShape(fetchImpl),
    await checkNationalRatesShape(fetchImpl, process.env['FRED_API_KEY'] ?? ''),
    await checkFiscalShape(fetchImpl),
    await checkDirectShape(fetchImpl),
  ];
}

/** The host refused the check (403, 429): a warning, not a red job. Any other http code is red. */
export function unavailable(line: string): boolean {
  return / shape http (403|429)$/.test(line);
}

/** A green line. A shape failure stays red. */
export function succeeded(line: string): boolean {
  return (
    line.endsWith(' ok') ||
    line.endsWith(' unchanged') ||
    line.endsWith(' changed') ||
    unavailable(line)
  );
}

function isDirect(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirect()) {
  checkLiveShapes(fetch)
    .then((lines) => {
      for (const line of lines) {
        process.stdout.write(`${line}\n`);
        if (unavailable(line)) process.stdout.write(`::warning::${line}\n`);
      }
      if (lines.some((line) => !succeeded(line))) process.exitCode = 1;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'ingest live shape failed';
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
