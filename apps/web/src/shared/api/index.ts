// getGateway() may be called only from entities/*/api (ESLint GATEWAY rule).
// The implementations load through import() on the first call (ADR-016 D2; depcruise
// gateway-impl-dynamic-only), so a route without data requests ships no mock, fixtures or schemas.
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
        // a failed chunk and a broken mock config look alike here; `cause` tells them apart
        throw new GatewayError('unavailable', 'the data module failed to load', true, { cause });
      }
      const method = gateway[name] as (
        ...a: Parameters<DataGateway[K]>
      ) => Promise<Awaited<ReturnType<DataGateway[K]>>>;
      return method.apply(gateway, args);
    };
  // an object literal of DataGateway: a new method does not compile until it is listed here
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

/** On the server and at build time the mock never fails or waits, so a build is never random. */
export function loadGateway(config: Env, server: boolean): Promise<DataGateway> {
  return config.dataSource === 'http'
    ? import('./gateway.http').then((m) => m.httpGateway)
    : import('./gateway.mock').then((m) =>
        m.createMockGateway({
          seed: config.seed,
          latency: server ? 'none' : 'simulated',
          failureRate: server ? 0 : config.mockFailureRate,
        }),
      );
}

let instance: DataGateway | undefined;

export function getGateway(): DataGateway {
  instance ??= createLazyGateway(() => loadGateway(env, typeof window === 'undefined'));
  return instance;
}
