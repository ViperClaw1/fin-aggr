import { inflateSync, strToU8, unzipSync, zipSync } from 'fflate';

const QUARTER_FILES = new Set(['FOICU.txt', 'FS220.txt']);

function latin1(bytes: Uint8Array): string {
  let text = '';
  const size = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += size) {
    text += String.fromCharCode(...bytes.subarray(offset, offset + size));
  }
  return text;
}

/** FOICU and FS220 only. The rest of the quarter is not decoded. */
export function readQuarterTables(zip: Uint8Array): { foicu: string; fs220: string } {
  const files = unzipSync(zip, {
    filter(file) {
      return QUARTER_FILES.has(file.name);
    },
  });
  const foicu = files['FOICU.txt'];
  const fs220 = files['FS220.txt'];
  if (foicu === undefined || fs220 === undefined) throw new Error('ncua zip missing table');
  return { foicu: latin1(foicu), fs220: latin1(fs220) };
}

interface LocalEntry {
  method: number;
  data: Uint8Array;
}

function localEntry(zip: Uint8Array, name: string): LocalEntry | 'range' | null {
  let offset = 0;
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  while (offset + 30 <= zip.length) {
    if (view.getUint32(offset, true) !== 0x04034b50) return null;
    const method = view.getUint16(offset + 8, true);
    const compressed = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressed;
    if (dataEnd > zip.length) return 'range';
    const entryName = latin1(zip.subarray(nameStart, nameStart + nameLength));
    if (entryName === name) return { method, data: zip.subarray(dataStart, dataEnd) };
    offset = dataEnd;
  }
  return null;
}

function inflateEntry(entry: LocalEntry): string {
  if (entry.method === 0) return latin1(entry.data);
  if (entry.method === 8) return latin1(inflateSync(entry.data));
  throw new Error('ncua zip method');
}

/**
 * One account and the dictionary header, from the start of the ZIP.
 * A short range is `range`, not a guess at the rest of the quarter.
 */
export function dictionaryProblems(zipPrefix: Uint8Array): string[] {
  if (zipPrefix.length < 4 || zipPrefix[0] !== 0x50 || zipPrefix[1] !== 0x4b) return ['magic'];
  const entry = localEntry(zipPrefix, 'AcctDesc.txt');
  if (entry === 'range') return ['range'];
  if (entry === null) return ['AcctDesc.txt'];
  const text = inflateEntry(entry);
  const header = text.slice(0, text.indexOf('\n'));
  const problems: string[] = [];
  if (!header.includes('"Account"') || !header.includes('"AcctName"')) problems.push('header');
  if (!text.includes('"Acct_010"') || !text.includes('TOTAL ASSETS')) problems.push('Acct_010');
  return problems;
}

/** Test helper. Production fetch does not build a ZIP. */
export function zipTables(files: Record<string, string>): Uint8Array {
  const encoded: Record<string, Uint8Array> = {};
  for (const [name, text] of Object.entries(files)) encoded[name] = strToU8(text);
  return zipSync(encoded);
}
