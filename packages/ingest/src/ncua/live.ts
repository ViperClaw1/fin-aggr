import { dictionaryProblems } from './zip';
import { NCUA_USER_AGENT, newestQuarterUrl } from './source';

const INDEX = 'https://ncua.gov/analysis/credit-union-corporate-call-report-data/quarterly-data';

/** The account dictionary sits in the first 80KB. The quarter file is not downloaded. */
export async function checkNcuaShape(fetchImpl: typeof fetch): Promise<string> {
  const index = await fetchImpl(INDEX, {
    signal: AbortSignal.timeout(30_000),
    headers: { accept: 'text/html', 'user-agent': NCUA_USER_AGENT },
  });
  if (!index.ok) return `ncua 5300 shape http ${String(index.status)}`;
  const url = newestQuarterUrl(await index.text());
  if (url === null) return 'ncua 5300 shape quarter';
  const file = await fetchImpl(url, {
    signal: AbortSignal.timeout(30_000),
    headers: {
      accept: 'application/zip',
      range: 'bytes=0-79999',
      'user-agent': NCUA_USER_AGENT,
    },
  });
  if (!file.ok && file.status !== 206) return `ncua 5300 shape http ${String(file.status)}`;
  const problems = dictionaryProblems(new Uint8Array(await file.arrayBuffer()));
  if (problems.length > 0) return `ncua 5300 shape ${problems.join(' ')}`;
  return 'ncua 5300 shape ok';
}
