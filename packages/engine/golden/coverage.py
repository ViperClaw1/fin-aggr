# Independent expected values for planCoverage. Shares no code with the engine.
# Rules: spec §5 planCoverage 1–5. Integer cents only. Limit $250,000 per owner, per institution,
# per category (the reference constant in the fixtures, unverified); joint × 2 owners.
import json

LIMIT = 25_000_000
OWNERS = {"single": 1, "joint": 2}


def plan(accounts, candidates, reserve=0, max_inst=None):
    """accounts: {category: cents}; candidates: [(id, kind, preference)]. Returns
    [allocations as (id, category, cents)], insured, uninsured, institutions used."""
    ordered, seen = [], set()
    for cid, kind, pref in sorted(candidates, key=lambda c: (c[2], c[0])):
        if cid in seen:
            continue
        seen.add(cid)
        if kind != "fintech_partner":
            ordered.append(cid)
    used, allocs = [], []
    for category in ("single", "joint"):
        left = accounts.get(category, 0)
        for cid in ordered:
            if left == 0:
                break
            if cid not in used and max_inst is not None and len(used) >= max_inst:
                continue
            take = min(left, max(0, LIMIT * OWNERS[category] - reserve))
            if take == 0:
                continue
            if cid not in used:
                used.append(cid)
            allocs.append([cid, category, take])
            left -= take
    insured = sum(a[2] for a in allocs)
    return {"allocations": allocs, "insured": insured,
            "uninsured": sum(accounts.values()) - insured, "used": len(used)}


BANKS = [("fdic:1", "direct_bank", 1), ("fdic:2", "direct_bank", 2),
         ("ncua:3", "credit_union", 3), ("fdic:4", "direct_bank", 4)]
print(json.dumps({
    "atLimit": plan({"single": LIMIT}, BANKS[:1]),
    "centAbove": plan({"single": LIMIT + 1}, BANKS[:1]),
    "centAboveTwoBanks": plan({"single": LIMIT + 1}, BANKS[:2]),
    "reserve": plan({"single": LIMIT}, BANKS[:2], reserve=100_000),
    "joint": plan({"joint": 2 * LIMIT}, BANKS[:1]),
    "maxInstitutions": plan({"single": 80_000_000}, BANKS, max_inst=2),
    "fintech": plan({"single": 10_000_000}, [("fin:9", "fintech_partner", 0), BANKS[0]]),
    "bothCategoriesOneInstitution": plan({"single": 30_000_000, "joint": 60_000_000}, BANKS[:2],
                                         max_inst=1),
}, indent=1))
