import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function unquote(value: string): string {
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"));
  return quoted ? value.slice(1, -1) : value;
}

function assignEnv(line: string): void {
  const trimmed = line.trim();
  if (trimmed === '' || trimmed.startsWith('#')) return;
  const index = trimmed.indexOf('=');
  if (index < 1) return;
  const key = trimmed.slice(0, index).trim();
  if (process.env[key] !== undefined) return;
  process.env[key] = unquote(trimmed.slice(index + 1).trim());
}

/** Loads `.env.local` without overriding variables already set. Values are not logged. */
export function loadLocalEnv(path = join(process.cwd(), '.env.local')): void {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
  for (const line of text.split(/\n/)) assignEnv(line);
}
