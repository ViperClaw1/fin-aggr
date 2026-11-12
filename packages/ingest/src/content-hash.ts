import { sha256Hex } from './pipeline';

/** Hash of response bodies in page order. Fetch time is not part of the content. */
export function bodyHash(bodies: readonly string[]): { sha256: string; bytes: Uint8Array } {
  const bytes = new TextEncoder().encode(JSON.stringify(bodies));
  return { sha256: sha256Hex(bytes), bytes };
}
