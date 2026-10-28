// "Now" for freshness labels (ADR-016 D6). Mock data counts from the data set date, so the demo
// text does not depend on the day it is viewed; real data counts from the clock. The mode comes
// from the gateway's answer, not from env: a real backend says isMock: false itself.
// ponytail: the clock branch reads Date.now(), which Next forbids while prerendering; a real
// backend page will need the table under <Suspense> or `now` from the server.
import type { DatasetInfo } from '@fa/contracts';
import { now } from '@/shared/lib/clock';

export const freshnessNow = (info: DatasetInfo, clock: () => Date = now): Date =>
  info.isMock ? new Date(`${info.asOf}T00:00:00Z`) : clock();
