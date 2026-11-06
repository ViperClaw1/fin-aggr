import { readFileSync } from 'node:fs';
import process from 'node:process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Node does not load .env.local. Existing process env wins.
export function loadLocalEnv() {
  const path = join(dirname(fileURLToPath(import.meta.url)), '../../.env.local');
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  for (const line of text.split(/\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

export function endpointOf(url) {
  const parsed = new globalThis.URL(url);
  return `${parsed.hostname}:${parsed.port === '' ? '5432' : parsed.port}`;
}

function isMissing(error) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
