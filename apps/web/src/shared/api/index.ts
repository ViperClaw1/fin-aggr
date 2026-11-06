// getGateway() may be called only from entities/*/api (ESLint GATEWAY rule).
// The implementations load through import() on the first call (ADR-016 D2; depcruise
// gateway-impl-dynamic-only), so a route without data requests ships no mock, fixtures or schemas.
// This module is server-only in the bundle graph: the browser uses `browser.ts` instead, so the
// supabase import below never lands in a Client Component.
import type { DataGateway } from '@fa/contracts';
import { env, type Env } from '@/shared/config';
import { createLazyGateway, loadClientGateway } from './browser';

/** On the server and at build time the mock never fails or waits, so a build is never random. */
export function loadGateway(config: Env, server: boolean): Promise<DataGateway> {
  if (config.dataSource === 'supabase') {
    if (!server) {
      return Promise.reject(new Error('the supabase gateway loads only on the server'));
    }
    return import('./gateway.supabase').then((m) => m.createSupabaseGateway());
  }
  return loadClientGateway(config, server);
}

let instance: DataGateway | undefined;

export function getGateway(): DataGateway {
  instance ??= createLazyGateway(() => loadGateway(env, typeof window === 'undefined'));
  return instance;
}

export { createLazyGateway } from './browser';
