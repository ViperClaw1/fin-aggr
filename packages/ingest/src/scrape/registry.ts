import { assertPublicPage, isBankSourceId } from './rules';

/**
 * One IANA zone per state, the zone of the larger part where a state is split.
 * The 08:00 UTC job is already inside 22:00–06:00 for every zone in this table.
 */
const STATE_ZONE: Record<string, string> = {
  AL: 'America/Chicago',
  AK: 'America/Anchorage',
  AZ: 'America/Phoenix',
  AR: 'America/Chicago',
  CA: 'America/Los_Angeles',
  CO: 'America/Denver',
  CT: 'America/New_York',
  DE: 'America/New_York',
  DC: 'America/New_York',
  FL: 'America/New_York',
  GA: 'America/New_York',
  HI: 'Pacific/Honolulu',
  ID: 'America/Boise',
  IL: 'America/Chicago',
  IN: 'America/Indiana/Indianapolis',
  IA: 'America/Chicago',
  KS: 'America/Chicago',
  KY: 'America/New_York',
  LA: 'America/Chicago',
  ME: 'America/New_York',
  MD: 'America/New_York',
  MA: 'America/New_York',
  MI: 'America/Detroit',
  MN: 'America/Chicago',
  MS: 'America/Chicago',
  MO: 'America/Chicago',
  MT: 'America/Denver',
  NE: 'America/Chicago',
  NV: 'America/Los_Angeles',
  NH: 'America/New_York',
  NJ: 'America/New_York',
  NM: 'America/Denver',
  NY: 'America/New_York',
  NC: 'America/New_York',
  ND: 'America/Chicago',
  OH: 'America/New_York',
  OK: 'America/Chicago',
  OR: 'America/Los_Angeles',
  PA: 'America/New_York',
  RI: 'America/New_York',
  SC: 'America/New_York',
  SD: 'America/Chicago',
  TN: 'America/Chicago',
  TX: 'America/Chicago',
  UT: 'America/Denver',
  VT: 'America/New_York',
  VA: 'America/New_York',
  WA: 'America/Los_Angeles',
  WV: 'America/New_York',
  WI: 'America/Chicago',
  WY: 'America/Denver',
};

/** Pilot, then the next 50 by deposits, then credit unions named as open membership. */
export const PILOT_LIMIT = 10;
export const DEPOSIT_LIMIT = 50;

type BankCohort = 'pilot' | 'deposits' | 'open-membership';

/** `unchecked` until someone looks for a public rates API. This step does not fetch the bank. */
type RatesChannel = 'unchecked';

export interface DirectoryInstitution {
  id: string;
  name: string;
  kind: 'direct_bank' | 'credit_union' | 'fintech_partner';
  hqState: string;
  website: string | null;
}

interface DepositRank {
  institutionId: string;
  depositsCents: string;
}

export interface BankRegistryEntry {
  sourceId: string;
  institutionId: string;
  name: string;
  url: string;
  timeZone: string;
  cohort: BankCohort;
  ratesChannel: RatesChannel;
}

export interface RegistryInput {
  institutions: readonly DirectoryInstitution[];
  /** Owner-named certificates. FDIC institutions do not include a rate, so this list is not derived. */
  pilotIds: readonly string[];
  deposits: readonly DepositRank[];
  /** NCUA charters someone has marked as open membership. The call report is not connected. */
  openMembershipIds: readonly string[];
}

export function stateTimeZone(hqState: string): string {
  const zone = STATE_ZONE[hqState];
  if (zone === undefined) throw new Error(`bank state ${hqState} has no time zone`);
  return zone;
}

/** `bank:` plus the institution id. Opt-out and the rate runner only accept this shape. */
function bankSourceId(institutionId: string): string {
  const id = `bank:${institutionId}`;
  if (!isBankSourceId(id)) throw new Error(`unknown source ${id}`);
  return id;
}

function directoryOf(
  institutions: readonly DirectoryInstitution[],
): Map<string, DirectoryInstitution> {
  const byId = new Map(institutions.map((bank) => [bank.id, bank]));
  if (byId.size !== institutions.length) throw new Error('directory has a duplicate bank');
  return byId;
}

function requireBank(byId: Map<string, DirectoryInstitution>, id: string): DirectoryInstitution {
  const bank = byId.get(id);
  if (bank === undefined) throw new Error(`bank ${id} is not in the directory`);
  return bank;
}

function uniqueIds(ids: readonly string[], label: string): void {
  if (new Set(ids).size !== ids.length) throw new Error(`${label} lists a bank twice`);
}

function centsRank(cents: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(cents)) throw new Error('deposits are not cents');
  return BigInt(cents);
}

function entryFrom(bank: DirectoryInstitution, cohort: BankCohort): BankRegistryEntry {
  if (bank.website === null || bank.name.trim() === '') {
    throw new Error(`bank ${bank.id} has no public page`);
  }
  const page = assertPublicPage(bank.website);
  return {
    sourceId: bankSourceId(bank.id),
    institutionId: bank.id,
    name: bank.name,
    url: page.href,
    timeZone: stateTimeZone(bank.hqState),
    cohort,
    ratesChannel: 'unchecked',
  };
}

function pilotCohort(
  byId: Map<string, DirectoryInstitution>,
  pilotIds: readonly string[],
): BankRegistryEntry[] {
  if (pilotIds.length > PILOT_LIMIT) throw new Error('pilot is limited to 10 banks');
  uniqueIds(pilotIds, 'pilot');
  return pilotIds.map((id) => {
    const bank = requireBank(byId, id);
    if (bank.kind !== 'direct_bank') throw new Error(`pilot bank ${id} is not a direct bank`);
    return entryFrom(bank, 'pilot');
  });
}

function depositCohort(
  byId: Map<string, DirectoryInstitution>,
  deposits: readonly DepositRank[],
  chosen: ReadonlySet<string>,
): BankRegistryEntry[] {
  uniqueIds(
    deposits.map((row) => row.institutionId),
    'deposits',
  );
  const ranked = [...deposits].sort((left, right) => {
    const bySize = centsRank(right.depositsCents) - centsRank(left.depositsCents);
    if (bySize !== 0n) return bySize > 0n ? 1 : -1;
    return left.institutionId < right.institutionId ? -1 : 1;
  });
  const entries: BankRegistryEntry[] = [];
  for (const row of ranked) {
    if (entries.length >= DEPOSIT_LIMIT) break;
    if (chosen.has(row.institutionId)) continue;
    const bank = requireBank(byId, row.institutionId);
    if (bank.kind !== 'direct_bank' || bank.website === null) continue;
    try {
      entries.push(entryFrom(bank, 'deposits'));
    } catch (error) {
      if (error instanceof Error && error.message === 'scrape url is not public') continue;
      throw error;
    }
  }
  return entries;
}

function membershipCohort(
  byId: Map<string, DirectoryInstitution>,
  ids: readonly string[],
  chosen: ReadonlySet<string>,
): BankRegistryEntry[] {
  uniqueIds(ids, 'open membership');
  const entries: BankRegistryEntry[] = [];
  for (const id of ids) {
    if (chosen.has(id)) continue;
    const bank = requireBank(byId, id);
    if (bank.kind !== 'credit_union')
      throw new Error(`open membership ${id} is not a credit union`);
    entries.push(entryFrom(bank, 'open-membership'));
  }
  return entries;
}

/** Pilot ids keep their order. Deposits are the next banks by cents. A named union stays last. */
export function selectBankRegistry(input: RegistryInput): BankRegistryEntry[] {
  const byId = directoryOf(input.institutions);
  const pilot = pilotCohort(byId, input.pilotIds);
  const chosen = new Set(pilot.map((entry) => entry.institutionId));
  const deposits = depositCohort(byId, input.deposits, chosen);
  for (const entry of deposits) chosen.add(entry.institutionId);
  return [...pilot, ...deposits, ...membershipCohort(byId, input.openMembershipIds, chosen)];
}
