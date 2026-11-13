import { sha256Hex } from './pipeline';

/** Hash of response bodies in page order. Fetch time is not part of the content. */
export function bodyHash(bodies: readonly string[]): { sha256: string; bytes: Uint8Array } {
  const bytes = new TextEncoder().encode(JSON.stringify(bodies));
  return { sha256: sha256Hex(bytes), bytes };
}

/** One stable line. The stored bytes are that line and nothing else. */
export function fingerprintOf(text: string): { sha256: string; bytes: Uint8Array } {
  return bodyHash([text]);
}

export function readFingerprint(bytes: Uint8Array): string {
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!Array.isArray(parsed) || parsed.length !== 1 || typeof parsed[0] !== 'string') {
    throw new Error('fingerprint invalid');
  }
  return parsed[0];
}
