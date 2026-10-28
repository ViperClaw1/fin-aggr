// Loads the profile schema on demand (ADR-016 D5).
import { lazyOnce } from '@/shared/lib/lazy-once';
import type { DraftCheck } from './schema';

export type CheckDraft = (value: unknown) => DraftCheck;
export type SchemaLoader = () => Promise<CheckDraft>;

export const loadProfileSchema: SchemaLoader = lazyOnce(() =>
  import('./schema').then((m) => m.checkDraft),
);
