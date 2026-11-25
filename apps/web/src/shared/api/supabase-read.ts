// Row helpers of the server gateway (ADR-019): errors to GatewayError, rows to plain records.
import { GatewayError } from '@fa/contracts';

interface DbError {
  code?: string;
  message: string;
}
interface Schema<T> {
  safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: Error };
}
type Result = PromiseLike<{ data: unknown; error: DbError | null }>;

export function raise(error: DbError): never {
  if (error.code === 'PGRST116') throw new GatewayError('not_found', error.message, false);
  throw new GatewayError('unavailable', error.message, true);
}

export function parsed<T>(schema: Schema<T>, value: unknown, label = 'row'): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new GatewayError('validation_failed', `${label}: ${result.error.message}`, false);
  }
  return result.data;
}

export async function many(query: Result): Promise<Record<string, unknown>[]> {
  const { data, error } = await query;
  if (error) raise(error);
  if (!Array.isArray(data)) return [];
  const rows: Record<string, unknown>[] = [];
  for (const row of data) {
    if (typeof row === 'object' && row !== null && !Array.isArray(row)) {
      rows.push(row as Record<string, unknown>);
    }
  }
  return rows;
}

export async function maybe(query: Result): Promise<Record<string, unknown> | null> {
  const { data, error } = await query;
  if (error) raise(error);
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  return data as Record<string, unknown>;
}

export async function one(query: Result): Promise<Record<string, unknown>> {
  const row = await maybe(query);
  if (row === null) throw new GatewayError('not_found', 'row missing', false);
  return row;
}
