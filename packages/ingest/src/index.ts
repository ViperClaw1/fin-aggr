// Connectors, bank adapters, the pipeline, the schedule and the CLI (ADR-020).
// apps/web does not import this package. Connectors start at plan step 6.
import type { SupabaseClient } from '@supabase/supabase-js';

/** Domains that publish as their own version (ADR-019). Ads are not one of them. */
export const DATASET_DOMAINS = [
  'institutions',
  'bank_metrics',
  'products',
  'treasury',
  'reference',
  'documents',
] as const;

export type DatasetDomain = (typeof DATASET_DOMAINS)[number];

/** The server client. Publish and the queue write share one transaction (ADR-019, ADR-020). */
export type IngestDb = SupabaseClient;
