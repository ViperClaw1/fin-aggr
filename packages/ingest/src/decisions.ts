import { requireReviewer } from './policy';
import { integerId } from './postgres/id';

export interface Sql {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export async function withTransaction<T>(sql: Sql, run: (sql: Sql) => Promise<T>): Promise<T> {
  await sql.query('begin');
  try {
    const value = await run(sql);
    await sql.query('commit');
    return value;
  } catch (error) {
    await sql.query('rollback');
    throw error;
  }
}

export interface OpenReview {
  id: number;
  source_id: string;
  domain: string;
  reason: string;
  snapshot_id: number | null;
  issue_url: string | null;
}

function numberField(row: Record<string, unknown>, key: string): number {
  return integerId(row[key]);
}

function textField(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw new Error(`review row is missing ${key}`);
  return value;
}

export function openReview(row: Record<string, unknown>): OpenReview {
  const snapshot = row['snapshot_id'];
  return {
    id: numberField(row, 'id'),
    source_id: textField(row, 'source_id'),
    domain: textField(row, 'domain'),
    reason: textField(row, 'reason'),
    snapshot_id: snapshot === null || snapshot === undefined ? null : integerId(snapshot),
    issue_url: typeof row['issue_url'] === 'string' ? row['issue_url'] : null,
  };
}

/** The reason stored when a later publish closes the open row for that source. */
export function supersededBy(versionId: number): string {
  return `superseded by version ${String(versionId)}`;
}

/** Closes open rows for this source. A row opened later in the same transaction stays open. */
export async function supersedeOpenReviews(
  sql: Sql,
  sourceId: string,
  versionId: number,
): Promise<void> {
  await sql.query(
    `update review_queue
       set status = 'superseded', decided_at = now(), decision_reason = $2
     where source_id = $1 and status = 'open'`,
    [sourceId, supersededBy(versionId)],
  );
}

/** One open row per source. A later hold updates that row instead of inserting another. */
export async function enqueueReview(
  sql: Sql,
  queue: { sourceId: string; domain: string; snapshotId: number; reason: string },
): Promise<{ queueId: number; issueUrl: string | null }> {
  const existing = await sql.query(
    `select id, issue_url from review_queue
     where source_id = $1 and status = 'open'
     order by id
     limit 1`,
    [queue.sourceId],
  );
  const row = existing.rows[0];
  if (row !== undefined) {
    const queueId = numberField(row, 'id');
    await sql.query(
      `update review_queue set snapshot_id = $2, reason = $3, domain = $4 where id = $1`,
      [queueId, queue.snapshotId, queue.reason, queue.domain],
    );
    const url = row['issue_url'];
    return { queueId, issueUrl: typeof url === 'string' ? url : null };
  }
  const inserted = await sql.query(
    `insert into review_queue (source_id, domain, snapshot_id, reason)
     values ($1, $2, $3, $4) returning id`,
    [queue.sourceId, queue.domain, queue.snapshotId, queue.reason],
  );
  return { queueId: numberField(inserted.rows[0] ?? {}, 'id'), issueUrl: null };
}

export async function listOpen(sql: Sql): Promise<OpenReview[]> {
  const result = await sql.query(
    `select id, source_id, domain, reason, snapshot_id
     from review_queue
     where status = 'open'
     order by id`,
  );
  return result.rows.map(openReview);
}

export async function approveReview(
  sql: Sql,
  input: { id: number; login: string; decidedAt: string; publish: (sql: Sql) => Promise<void> },
): Promise<void> {
  const login = requireReviewer(input.login);
  await withTransaction(sql, async (tx) => {
    const updated = await tx.query(
      `update review_queue
         set status = 'approved', decided_by = $2, decided_at = $3
       where id = $1 and status = 'open'
       returning id`,
      [input.id, login, input.decidedAt],
    );
    if (updated.rows[0] === undefined) throw new Error(`review ${String(input.id)} is not open`);
    await input.publish(tx);
  });
}

function requiredReason(reason: string | undefined, label: string): string {
  const text = reason?.trim() ?? '';
  if (text === '') throw new Error(`A ${label} reason is required`);
  return text;
}

export async function rejectReview(
  sql: Sql,
  input: { id: number; login: string; decidedAt: string; reason: string },
): Promise<void> {
  const login = requireReviewer(input.login);
  const reason = requiredReason(input.reason, 'reject');
  const updated = await sql.query(
    `update review_queue
       set status = 'rejected', decided_by = $2, decided_at = $3, decision_reason = $4
     where id = $1 and status = 'open'
     returning id`,
    [input.id, login, input.decidedAt, reason],
  );
  if (updated.rows[0] === undefined) throw new Error(`review ${String(input.id)} is not open`);
}

function timeField(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value !== '') return value;
  throw new Error(`review row is missing ${key}`);
}

function optionalReason(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
}

async function writeAudit(
  sql: Sql,
  input: {
    reviewId: number;
    action: 'approved' | 'rejected' | 'reopened';
    actor: string;
    actedAt: string;
    reason: string | null;
  },
): Promise<void> {
  await sql.query(
    `insert into review_audit (review_id, action, actor, acted_at, reason)
     values ($1, $2, $3, $4, $5)`,
    [input.reviewId, input.action, input.actor, input.actedAt, input.reason],
  );
}

/**
 * Puts an approved or rejected row back to open. The previous decision and this
 * reopen are both kept in review_audit. A published version is left in place.
 */
export async function reopenReview(
  sql: Sql,
  input: { id: number; login: string; reopenedAt: string; reason: string },
): Promise<{ issueUrl: string | null }> {
  const login = requireReviewer(input.login);
  const reason = requiredReason(input.reason, 'reopen');
  return withTransaction(sql, async (tx) => {
    const found = await tx.query(
      `select id, source_id, status, decided_by, decided_at, decision_reason, issue_url
       from review_queue
       where id = $1`,
      [input.id],
    );
    const row = found.rows[0];
    if (row === undefined) throw new Error(`review ${String(input.id)} is missing`);
    const status = textField(row, 'status');
    if (status !== 'approved' && status !== 'rejected') {
      throw new Error(`review ${String(input.id)} is not an approved or rejected decision`);
    }
    const sourceId = textField(row, 'source_id');
    const blocking = await tx.query(
      `select id from review_queue
       where source_id = $1 and status = 'open'`,
      [sourceId],
    );
    const other = blocking.rows[0];
    if (other !== undefined) {
      throw new Error(
        `review ${String(input.id)} cannot reopen while review ${String(numberField(other, 'id'))} is open`,
      );
    }
    const actor = requireReviewer(textField(row, 'decided_by'));
    await writeAudit(tx, {
      reviewId: input.id,
      action: status,
      actor,
      actedAt: timeField(row, 'decided_at'),
      reason: optionalReason(row['decision_reason']),
    });
    await writeAudit(tx, {
      reviewId: input.id,
      action: 'reopened',
      actor: login,
      actedAt: input.reopenedAt,
      reason,
    });
    const updated = await tx.query(
      `update review_queue
         set status = 'open', decided_by = null, decided_at = null, decision_reason = null
       where id = $1 and status in ('approved', 'rejected')
       returning id`,
      [input.id],
    );
    if (updated.rows[0] === undefined)
      throw new Error(`review ${String(input.id)} was not reopened`);
    const url = row['issue_url'];
    return { issueUrl: typeof url === 'string' ? url : null };
  });
}

export interface OverdueRow {
  id: number;
  issue_url: string | null;
}

export async function listOverdue(sql: Sql, cutoffIso: string): Promise<OverdueRow[]> {
  const result = await sql.query(
    `select id, issue_url
     from review_queue
     where status = 'open' and created_at < $1
     order by id`,
    [cutoffIso],
  );
  return result.rows.map((row) => {
    const url = row['issue_url'];
    return { id: numberField(row, 'id'), issue_url: typeof url === 'string' ? url : null };
  });
}
