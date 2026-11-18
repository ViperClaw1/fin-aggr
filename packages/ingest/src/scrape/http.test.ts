import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { isHeadersOverflow } from '../network';
import { SCRAPE_MAX_HEADER_SIZE, scrapeFetch } from './http';

let server: Server | undefined;

async function serveHeaderOf(bytes: number): Promise<string> {
  server = createServer((_req, res) => {
    res.setHeader('x-pad', 'a'.repeat(bytes));
    res.end('ok');
  });
  await new Promise<void>((resolve) => {
    server?.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return `http://127.0.0.1:${String(address.port)}/`;
}

afterEach(async () => {
  await new Promise<void>((resolve) => {
    if (server === undefined) resolve();
    else
      server.close(() => {
        resolve();
      });
  });
  server = undefined;
});

describe('scrape transport', () => {
  it('reads a response with a 32 KB header block, which Node fetch rejects', async () => {
    const url = await serveHeaderOf(32_000);
    const response = await scrapeFetch(url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
  });

  it('still reports a header block above 64 KB as a header overflow', async () => {
    expect(SCRAPE_MAX_HEADER_SIZE).toBe(65_536);
    const url = await serveHeaderOf(70_000);
    const failure: unknown = await scrapeFetch(url).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(isHeadersOverflow(failure)).toBe(true);
  });
});
