import type { SurveyRow } from './run';

/** Plan 8.4 output. Shares are basis points of all deposits in the current `bank_metrics`. */
export interface SurveyReport {
  surveyed: number;
  curve: { top: number; depositsBp: number; readableBp: number }[];
  statuses: Record<SurveyRow['status'], number>;
  blockedBp: number;
  blockReasons: Record<string, number>;
  ratesPageFound: number;
  ratesWithoutJs: number;
  disclosurePdf: number;
  generators: { name: string; institutions: number }[];
  scriptHosts: { host: string; institutions: number }[];
}

const CURVE = [10, 25, 50, 100, 200, 300, 500];
/** A script host shared by fewer institutions is not a platform cluster. */
const CLUSTER_MIN = 3;

/** Integer basis points; deposits are integer thousands, so no float reaches the result. */
function bp(part: bigint, total: bigint): number {
  return total === 0n ? 0 : Number((part * 10000n) / total);
}

/** Rates in served HTML: the factory can read this institution without a browser. */
function readable(row: SurveyRow): boolean {
  return row.status === 'ok' && row.ratesWithoutJs === true;
}

function counted(keys: readonly string[], min: number): [string, number][] {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts]
    .filter(([, n]) => n >= min)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

export function surveyReport(rows: readonly SurveyRow[], totalUsdThousands: number): SurveyReport {
  const total = BigInt(totalUsdThousands);
  const ranked = [...rows].sort((a, b) => b.depositsUsdThousands - a.depositsUsdThousands);
  const sum = (list: readonly SurveyRow[]) =>
    list.reduce((acc, row) => acc + BigInt(row.depositsUsdThousands), 0n);
  const statuses = { ok: 0, blocked: 0, missing: 0, excluded: 0, error: 0 };
  for (const row of rows) statuses[row.status] += 1;
  const blocked = rows.filter((row) => row.status === 'blocked');
  return {
    surveyed: rows.length,
    curve: CURVE.filter((top) => top <= ranked.length).map((top) => {
      const head = ranked.slice(0, top);
      return {
        top,
        depositsBp: bp(sum(head), total),
        readableBp: bp(sum(head.filter(readable)), total),
      };
    }),
    statuses,
    blockedBp: bp(sum(blocked), total),
    blockReasons: Object.fromEntries(
      counted(
        blocked.map((row) => row.blockReason ?? 'unknown'),
        1,
      ),
    ),
    ratesPageFound: rows.filter((row) => row.ratesUrl !== null).length,
    ratesWithoutJs: rows.filter(readable).length,
    disclosurePdf: rows.filter((row) => row.disclosurePdfUrl !== null).length,
    generators: counted(
      rows.flatMap((row) => (row.generator === null ? [] : [row.generator])),
      CLUSTER_MIN,
    ).map(([name, institutions]) => ({ name, institutions })),
    scriptHosts: counted(
      rows.flatMap((row) => row.scriptHosts),
      CLUSTER_MIN,
    ).map(([host, institutions]) => ({ host, institutions })),
  };
}

const pct = (value: number): string =>
  `${String(Math.trunc(value / 100))}.${String(value % 100).padStart(2, '0')}%`;

export function formatSurveyReport(report: SurveyReport): string[] {
  return [
    `survey institutions=${String(report.surveyed)} ok=${String(report.statuses.ok)} blocked=${String(report.statuses.blocked)} missing=${String(report.statuses.missing)} excluded=${String(report.statuses.excluded)} error=${String(report.statuses.error)}`,
    ...report.curve.map(
      (point) =>
        `curve top=${String(point.top)} deposits=${pct(point.depositsBp)} readable_without_js=${pct(point.readableBp)}`,
    ),
    `blocked deposits=${pct(report.blockedBp)} reasons=${JSON.stringify(report.blockReasons)}`,
    `rates_page=${String(report.ratesPageFound)} rates_without_js=${String(report.ratesWithoutJs)} disclosure_pdf=${String(report.disclosurePdf)}`,
    ...report.generators.map(
      (g) => `generator ${JSON.stringify(g.name)} institutions=${String(g.institutions)}`,
    ),
    ...report.scriptHosts.map(
      (s) => `script_host ${s.host} institutions=${String(s.institutions)}`,
    ),
  ];
}
