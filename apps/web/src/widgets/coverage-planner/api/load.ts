// Insurance rules and the institution list at build time. The limit is never copied into code.
import type { Id, Institution, InsuranceRules } from '@fa/contracts';
import { cacheLife } from 'next/cache';
import { institutionsQuery } from '@/entities/institution/queries';
import { insuranceRulesQuery } from '@/entities/reference/queries';
import { makeQueryClient } from '@/shared/lib/query-client';

export interface CoverageInstitution {
  id: Id;
  name: string;
  kind: Institution['kind'];
  regulator: Institution['regulator'];
}

export interface CoverageData {
  institutions: CoverageInstitution[];
  rules: InsuranceRules;
}

export async function loadCoverageData(): Promise<CoverageData> {
  'use cache';
  cacheLife('max');
  const client = makeQueryClient();
  const [institutions, rules] = await Promise.all([
    client.query(institutionsQuery({ limit: 100 })),
    client.query(insuranceRulesQuery()),
  ]);
  const items = institutions.items.map((item) => ({
    id: item.id,
    name: item.name,
    kind: item.kind,
    regulator: item.regulator,
  }));
  items.sort((a, b) => a.name.localeCompare(b.name, 'en-US'));
  return { institutions: items, rules };
}
