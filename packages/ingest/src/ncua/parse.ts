import { BankMetrics, Institution, type Institution as InstitutionRow } from '@fa/contracts';
import type { CallReport } from '../fdic/financials';
import { CodedError } from '../fetch-budget';
import { thousandsFromDollars } from './amounts';
import { columnIndex, parseCsv } from './csv';
import { readQuarterTables } from './zip';

const SOURCE_ID = 'ncua-5300';

export interface NcuaRaw {
  retrievedAt: string;
  sourceUrl: string;
  zip: Uint8Array;
}

export interface NcuaRow {
  institution: InstitutionRow;
  report: CallReport | null;
}

function isoDate(year: number, month: number, day: number): string | null {
  const utc = new Date(Date.UTC(year, month - 1, day));
  const same =
    utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
  if (!same) return null;
  const monthText = String(month).padStart(2, '0');
  const dayText = String(day).padStart(2, '0');
  return `${String(year)}-${monthText}-${dayText}`;
}

function cycleDate(value: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value.trim());
  if (match === null) return null;
  const month = Number(match[1] ?? '');
  const day = Number(match[2] ?? '');
  const year = Number(match[3] ?? '');
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  return isoDate(year, month, day);
}

function cell(row: readonly string[], index: number): string {
  return (row[index] ?? '').trim();
}

function indexByCharter(table: string, charterColumn: string): Map<string, string[]> {
  const rows = parseCsv(table);
  const header = rows[0];
  if (header === undefined) throw new Error('ncua table');
  const charter = columnIndex(header, charterColumn);
  const byCharter = new Map<string, string[]>();
  for (const row of rows.slice(1)) {
    const id = cell(row, charter);
    if (!/^\d+$/.test(id)) continue;
    if (byCharter.has(id)) throw new Error('ncua duplicate charter');
    byCharter.set(id, row);
  }
  return byCharter;
}

function provenance(raw: NcuaRaw, asOf: string) {
  return {
    sourceId: SOURCE_ID,
    sourceUrl: raw.sourceUrl,
    retrievedAt: raw.retrievedAt,
    verification: { status: 'verified' as const, verifiedAt: asOf, by: 'official_api' as const },
    isMock: false,
  };
}

function callReport(
  raw: NcuaRaw,
  input: { charter: string; asOf: string; assets: string; shares: string },
): CallReport | null {
  if (!/^\d+$/.test(input.assets) || !/^\d+$/.test(input.shares)) return null;
  const source = provenance(raw, input.asOf);
  return {
    report: BankMetrics.parse({
      institutionId: `ncua:${input.charter}`,
      asOf: input.asOf,
      totalAssetsUsdThousands: thousandsFromDollars(input.assets),
      metrics: {},
      balanceSheetMix: [],
      provenance: source,
    }),
    depositsUsdThousands: thousandsFromDollars(input.shares),
  };
}

function requireCycle(value: string, quarter: string | null): string {
  const asOf = cycleDate(value);
  if (asOf === null) throw new Error('ncua cycle date');
  if (quarter !== null && asOf !== quarter) throw new CodedError('mixed_quarter');
  return asOf;
}

/**
 * Directory from FOICU. Assets and shares from FS220 `ACCT_010` and `ACCT_018`.
 * Both accounts are whole dollars in this file. Ratio keys stay absent: AcctDesc
 * names a risk-based capital ratio but does not state its scale.
 */
export function parseNcuaQuarter(raw: NcuaRaw): NcuaRow[] {
  const tables = readQuarterTables(raw.zip);
  const directory = parseCsv(tables.foicu);
  const header = directory[0];
  if (header === undefined) throw new Error('ncua directory');
  const charter = columnIndex(header, 'CU_NUMBER');
  const name = columnIndex(header, 'CU_NAME');
  const state = columnIndex(header, 'STATE');
  const cycle = columnIndex(header, 'CYCLE_DATE');
  const statements = indexByCharter(tables.fs220, 'CU_NUMBER');
  const statementHeader = parseCsv(tables.fs220)[0];
  if (statementHeader === undefined) throw new Error('ncua statement');
  const assets = columnIndex(statementHeader, 'ACCT_010');
  const shares = columnIndex(statementHeader, 'ACCT_018');
  const statementCycle = columnIndex(statementHeader, 'CYCLE_DATE');
  let quarter: string | null = null;
  const rows: NcuaRow[] = [];
  for (const record of directory.slice(1)) {
    const id = cell(record, charter);
    const title = cell(record, name);
    const hq = cell(record, state);
    if (!/^\d+$/.test(id) || title === '' || !/^[A-Z]{2}$/.test(hq)) continue;
    const asOf = requireCycle(cell(record, cycle), quarter);
    quarter ??= asOf;
    const statement = statements.get(id);
    const report =
      statement === undefined
        ? null
        : callReport(raw, {
            charter: id,
            asOf: requireCycle(cell(statement, statementCycle), quarter),
            assets: cell(statement, assets),
            shares: cell(statement, shares),
          });
    const institution = Institution.parse({
      id: `ncua:${id}`,
      name: title,
      regulator: 'NCUA',
      kind: 'credit_union',
      partnerInstitutionIds: [],
      hqState: hq,
      website: null,
      provenance: provenance(raw, asOf),
    });
    rows.push({ institution, report });
  }
  return rows;
}
