// "Now" for freshness labels (ADR-016 D6, ADR-019). A mock fact counts from its domain date, so
// the demo text does not depend on the day it is viewed. A real fact counts from the clock only
// when every domain is real. While the demo still has a mock domain, a real fact uses its own
// domain date so the static page does not read the clock. Without a fact, the rollup flag is used.
// ponytail: the clock branch reads Date.now(), which Next forbids while prerendering; a fully
// real page will need the table under <Suspense> or `now` from the server.
import type { DatasetDomain, DatasetInfo } from '@fa/contracts';
import { now } from '@/shared/lib/clock';

const utcDate = (asOf: string): Date => new Date(`${asOf}T00:00:00Z`);

export function freshnessNow(
  info: DatasetInfo,
  clock: () => Date = now,
  fact?: { isMock: boolean; domain: DatasetDomain },
): Date {
  if (fact === undefined) return info.isMock ? utcDate(info.asOf) : clock();
  const domainDate = utcDate(info.domains[fact.domain].asOf);
  if (fact.isMock) return domainDate;
  const demoRemains = Object.values(info.domains).some((row) => row.isMock);
  return demoRemains ? domainDate : clock();
}
