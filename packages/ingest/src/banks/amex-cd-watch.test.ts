import { describe, expect, it } from 'vitest';
import { fingerprintOf, readFingerprint } from '../content-hash';
import { amexCdSentences } from '../scrape/banks/normalize';
import { amexCdWatchSource, amexCdWatchText } from './amex-cd-watch';

describe('American Express CD page watch', () => {
  it('fingerprints the penalty, minimum, and compounding sentences', () => {
    const sentences = amexCdSentences();
    const html = `<body><p>${sentences.join('</p><p>')}</p></body>`;
    expect(amexCdWatchText(html)).toBe(sentences.join('\n'));
  });

  it('marks a sentence the page dropped so the fingerprint changes', () => {
    const [min, compound, ...penalties] = amexCdSentences();
    const html = `<body><p>${min ?? ''}</p><p>${compound ?? ''}</p></body>`;
    const text = amexCdWatchText(html);
    expect(text.startsWith(`${min ?? ''}\n${compound ?? ''}`)).toBe(true);
    expect(text).toContain('missing:');
    expect(penalties.every((sentence) => text.includes(`missing: ${sentence}`))).toBe(true);
    const previous = fingerprintOf(amexCdSentences().join('\n'));
    const source = amexCdWatchSource(() => Promise.resolve(html));
    expect(source.changed(previous.bytes, text)).toBe(true);
    expect(readFingerprint(source.persist(previous.bytes, text).bytes)).toBe(text);
  });
});
