// Contract suite against a running database (ADR-019 step 3). Skips unless SUPABASE_URL is set,
// so `pnpm test` stays green without Docker. CI sets the variables after `supabase start`.
import { describe } from 'vitest';
import { gatewayContract } from './contract-suite';
import { createSupabaseGateway } from './gateway.supabase';

const url = process.env['SUPABASE_URL']?.trim();
const live = url !== undefined && url !== '';

describe.skipIf(!live)('supabase gateway', () => {
  gatewayContract('supabase', () => createSupabaseGateway());
});
