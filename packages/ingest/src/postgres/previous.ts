import type { Sql } from '../decisions';

/**
 * The seeded mock version is not a baseline.
 * The count gate and a move check start from the first real publish.
 */
export async function previousUnlessMock<T>(
  sql: Sql,
  domain: string,
  load: (sql: Sql) => Promise<readonly T[]>,
): Promise<T[]> {
  const result = await sql.query(
    `select is_mock from dataset_versions where domain = $1 and is_current`,
    [domain],
  );
  if (result.rows[0]?.['is_mock'] === true) return [];
  return [...(await load(sql))];
}
