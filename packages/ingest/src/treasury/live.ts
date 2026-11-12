import { pathToFileURL } from 'node:url';
import { PAR_YIELD_USER_AGENT, parYieldHeaderProblems, parYieldUrl } from './par-yield';

/** One request for the current year. The body is not logged. */
export async function checkParYieldShape(fetchImpl: typeof fetch): Promise<string> {
  const year = Number(new Date().toISOString().slice(0, 4));
  const response = await fetchImpl(parYieldUrl(year), {
    signal: AbortSignal.timeout(30_000),
    headers: { accept: 'text/csv', 'user-agent': PAR_YIELD_USER_AGENT },
  });
  if (!response.ok) return `treasury par yield shape http ${String(response.status)}`;
  const problems = parYieldHeaderProblems(await response.text());
  if (problems.length > 0) return `treasury par yield shape ${problems.join(' ')}`;
  return 'treasury par yield shape ok';
}

function isDirect(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirect()) {
  checkParYieldShape(fetch)
    .then((line) => {
      process.stdout.write(`${line}\n`);
      if (!line.endsWith(' ok')) process.exitCode = 1;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'treasury par yield shape failed';
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
