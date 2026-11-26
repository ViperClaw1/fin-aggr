import type { Sql } from '../decisions';
import { stateTimeZone } from '../scrape/registry';
import type { SurveyRow, SurveyTarget } from '../survey/run';

/**
 * The largest institutions by deposits in the current `bank_metrics` version, with a website in
 * the current `institutions` version. An institution with a survey row is skipped, so the next
 * night resumes where the window closed. `bank:` sources that are excluded stay excluded.
 */
export async function surveyTargets(sql: Sql, limit: number): Promise<SurveyTarget[]> {
  const result = await sql.query(
    `with ranked as (
       select m.institution_id, m.deposits_usd_thousands
       from bank_metrics m
       join dataset_versions v on v.id = m.version_id
       where v.domain = 'bank_metrics' and v.is_current and m.deposits_usd_thousands is not null
       order by m.deposits_usd_thousands desc, m.institution_id
       limit $1
     )
     select r.institution_id, r.deposits_usd_thousands, i.website, i.hq_state,
            coalesce(s.excluded, false) as excluded
     from ranked r
     join institutions i on i.id = r.institution_id
     join dataset_versions iv on iv.id = i.version_id and iv.domain = 'institutions' and iv.is_current
     left join sources s on s.id = 'bank:' || r.institution_id
     where i.website is not null
       and not exists (select 1 from survey_results x where x.institution_id = r.institution_id)
     order by r.deposits_usd_thousands desc, r.institution_id`,
    [limit],
  );
  return result.rows.flatMap((row) => {
    const website = String(row['website']);
    const url = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    try {
      return [
        {
          institutionId: String(row['institution_id']),
          website: url.replace(/^http:/i, 'https:'),
          timeZone: stateTimeZone(String(row['hq_state'])),
          depositsUsdThousands: Number(row['deposits_usd_thousands']),
          excluded: row['excluded'] === true,
        },
      ];
    } catch {
      return []; // a territory without a zone (PR, GU): outside the survey
    }
  });
}

export async function saveSurveyRow(sql: Sql, row: SurveyRow): Promise<void> {
  await sql.query(
    `insert into survey_results (institution_id, surveyed_at, deposits_usd_thousands, status,
       block_reason, error_code, home_url, rates_url, rates_without_js, disclosure_pdf_url,
       generator, script_hosts)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      row.institutionId,
      row.surveyedAt,
      row.depositsUsdThousands,
      row.status,
      row.blockReason,
      row.errorCode,
      row.homeUrl,
      row.ratesUrl,
      row.ratesWithoutJs,
      row.disclosurePdfUrl,
      row.generator,
      row.scriptHosts,
    ],
  );
}

/** Every surveyed row, latest per institution, and the total deposits of the current version. */
export async function surveyFacts(
  sql: Sql,
): Promise<{ rows: SurveyRow[]; totalDepositsUsdThousands: number }> {
  const rows = await sql.query(
    `select distinct on (institution_id) institution_id, surveyed_at::text as surveyed_at,
            deposits_usd_thousands, status, block_reason, error_code, home_url, rates_url,
            rates_without_js, disclosure_pdf_url, generator, script_hosts
     from survey_results order by institution_id, surveyed_at desc`,
  );
  const total = await sql.query(
    `select coalesce(sum(m.deposits_usd_thousands), 0)::text as total
     from bank_metrics m join dataset_versions v on v.id = m.version_id
     where v.domain = 'bank_metrics' and v.is_current`,
  );
  return {
    rows: rows.rows.map((row) => ({
      institutionId: String(row['institution_id']),
      surveyedAt: String(row['surveyed_at']),
      depositsUsdThousands: Number(row['deposits_usd_thousands']),
      status: row['status'] as SurveyRow['status'],
      blockReason: (row['block_reason'] as string | null) ?? null,
      errorCode: (row['error_code'] as string | null) ?? null,
      homeUrl: (row['home_url'] as string | null) ?? null,
      ratesUrl: (row['rates_url'] as string | null) ?? null,
      ratesWithoutJs: (row['rates_without_js'] as boolean | null) ?? null,
      disclosurePdfUrl: (row['disclosure_pdf_url'] as string | null) ?? null,
      generator: (row['generator'] as string | null) ?? null,
      scriptHosts: (row['script_hosts'] as string[] | null) ?? [],
    })),
    totalDepositsUsdThousands: Number(total.rows[0]?.['total'] ?? 0),
  };
}
