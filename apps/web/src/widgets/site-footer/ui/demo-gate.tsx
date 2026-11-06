// The layout banner. It stays while any version domain is still mock (ADR-019).
import { DATASET_DOMAINS } from '@fa/contracts';
import { DemoDataBanner } from '@/shared/ui/demo-banner';
import { loadDataset } from '../api/load';

export async function DemoDataGate() {
  const info = await loadDataset();
  if (DATASET_DOMAINS.every((domain) => !info.domains[domain].isMock)) return null;
  return <DemoDataBanner />;
}
