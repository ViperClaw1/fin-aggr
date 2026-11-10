import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkEcfrPartShape } from './live';
import { ecfrVersionsProblems, ecfrWatchLine, parseEcfrPart, versionsUrl } from './parts';

function load(name: string): unknown {
  return JSON.parse(readFileSync(join(import.meta.dirname, name), 'utf8')) as unknown;
}

const recorded = [
  {
    part: '330',
    amendmentDate: '2026-04-22',
    identifier: '330.3',
    title: 'Deposit Insurance Coverage',
  },
  {
    part: '745',
    amendmentDate: '2024-10-30',
    identifier: '745.14,745.2,745.3',
    title: 'Share Insurance and Appendix',
  },
  {
    part: '328',
    amendmentDate: '2026-03-02',
    identifier: '328.101,328.4,328.5',
    title:
      "FDIC Official Signs, Advertisement of Membership, False Advertising, Misrepresentation of Insured Status, and Misuse of the FDIC's Name or Logo",
  },
] as const;

describe('eCFR title 12 parts', () => {
  it('keeps the part id, latest amendment, and title from the saved responses', () => {
    for (const expected of recorded) {
      const versions = load(`versions-${expected.part}.json`);
      const structure = load(`structure-${expected.part}.json`);
      expect(ecfrVersionsProblems(versions)).toEqual([]);
      expect(parseEcfrPart(versions, structure)).toEqual({
        part: expected.part,
        identifier: expected.identifier,
        amendmentDate: expected.amendmentDate,
        title: expected.title,
      });
    }
  });

  it('reports a date or section change as a fixed line', () => {
    const versions = load('versions-330.json');
    const structure = load('structure-330.json');
    const stamp = parseEcfrPart(versions, structure);
    expect(ecfrWatchLine(stamp, stamp)).toBe('ecfr 330 unchanged');
    expect(ecfrWatchLine(stamp, { ...stamp, amendmentDate: '2020-01-01' })).toBe(
      'ecfr 330 changed',
    );
    expect(ecfrWatchLine(stamp, { ...stamp, identifier: '330.9' })).toBe('ecfr 330 changed');
    expect(ecfrWatchLine(stamp, { ...stamp, title: 'Renamed' })).toBe('ecfr 330 unchanged');
  });

  it('rejects a versions body that is not the versioner shape', () => {
    expect(ecfrVersionsProblems(null)).toEqual(['body']);
    expect(ecfrVersionsProblems({ meta: { part: '330' } })).toEqual([
      'meta.latest_amendment_date',
      'content_versions',
    ]);
    expect(() => parseEcfrPart({ meta: {} }, { type: 'part' })).toThrow('ecfr versions invalid');
  });

  it('compares one live part with the saved stamp and does not print the date', async () => {
    const versions = load('versions-330.json');
    const structure = load('structure-330.json');
    const same = await checkEcfrPartShape(
      () => Promise.resolve(new Response(JSON.stringify(versions), { status: 200 })),
      versions,
      structure,
    );
    expect(same).toBe('ecfr 330 unchanged');
    expect(versionsUrl('330')).toContain('part=330');

    const moved = JSON.parse(JSON.stringify(versions)) as {
      meta: { latest_amendment_date: string };
    };
    moved.meta.latest_amendment_date = '2024-04-01';
    const changed = await checkEcfrPartShape(
      () => Promise.resolve(new Response(JSON.stringify(moved), { status: 200 })),
      versions,
      structure,
    );
    expect(changed).toBe('ecfr 330 changed');
    expect(changed).not.toContain('2024-04-01');

    const down = await checkEcfrPartShape(
      () => Promise.resolve(new Response('no', { status: 503 })),
      versions,
      structure,
    );
    expect(down).toBe('ecfr 330 shape http 503');
  });
});
