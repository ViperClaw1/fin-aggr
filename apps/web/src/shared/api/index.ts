// getGateway() may be called only from entities/*/api (ESLint GATEWAY rule).
import type { DataGateway } from '@fa/contracts';
import { env } from '@/shared/config';
import { httpGateway } from './gateway.http';
import { createMockGateway } from './gateway.mock';

let instance: DataGateway | undefined;

export function getGateway(): DataGateway {
  instance ??=
    env.dataSource === 'http'
      ? httpGateway
      : createMockGateway({
          seed: env.seed,
          latency: typeof window === 'undefined' ? 'none' : 'simulated',
          failureRate: env.mockFailureRate,
        });
  return instance;
}
