// Browser and mock/http loading. No Supabase import: a client module that reaches this file
// must not pull in `server-only` (the citation panel imports the document query).
import { GatewayError, type DataGateway } from '@fa/contracts';
import { env, type Env } from '@/shared/config';
import { lazyOnce } from '@/shared/lib/lazy-once';

/** A gateway whose methods await `load` first; a failed load is a retryable `unavailable`. */
export function createLazyGateway(load: () => Promise<DataGateway>): DataGateway {
  const once = lazyOnce(load);
  const call =
    <K extends keyof DataGateway>(name: K) =>
    async (...args: Parameters<DataGateway[K]>): Promise<Awaited<ReturnType<DataGateway[K]>>> => {
      let gateway: DataGateway;
      try {
        gateway = await once();
      } catch (cause) {
        throw new GatewayError('unavailable', 'the data module failed to load', true, { cause });
      }
      const method = gateway[name] as (
        ...a: Parameters<DataGateway[K]>
      ) => Promise<Awaited<ReturnType<DataGateway[K]>>>;
      return method.apply(gateway, args);
    };
  return {
    listInstitutions: call('listInstitutions'),
    getInstitution: call('getInstitution'),
    getBankMetrics: call('getBankMetrics'),
    listProducts: call('listProducts'),
    getProduct: call('getProduct'),
    getDocument: call('getDocument'),
    listFacts: call('listFacts'),
    getTaxTables: call('getTaxTables'),
    getInsuranceRules: call('getInsuranceRules'),
    listSources: call('listSources'),
    listSponsored: call('listSponsored'),
    getDatasetInfo: call('getDatasetInfo'),
  };
}

/** Mock and http only. The supabase arm lives in `index.ts`, which the browser does not import. */
export function loadClientGateway(config: Env, server: boolean): Promise<DataGateway> {
  if (config.dataSource === 'http') return import('./gateway.http').then((m) => m.httpGateway);
  return import('./gateway.mock').then((m) =>
    m.createMockGateway({
      seed: config.seed,
      latency: server ? 'none' : 'simulated',
      failureRate: server ? 0 : config.mockFailureRate,
    }),
  );
}

let instance: DataGateway | undefined;

export function getGateway(): DataGateway {
  instance ??= createLazyGateway(() => loadClientGateway(env, typeof window === 'undefined'));
  return instance;
}
