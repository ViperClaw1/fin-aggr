// Loads the profile schema on demand (ADR-016 D5). Only a successful load is cached: a failed chunk
// load is retried on the next call instead of returning the same rejection forever.
import type { DraftCheck } from './schema';

export type CheckDraft = (value: unknown) => DraftCheck;
export type SchemaLoader = () => Promise<CheckDraft>;

let loading: Promise<CheckDraft> | null = null;

export const loadProfileSchema: SchemaLoader = () => {
  loading ??= import('./schema').then(
    (m) => m.checkDraft,
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
};
