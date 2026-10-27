# Independent expected values for computeNetYield. Shares no code with the engine.
# Rules: spec §5 computeNetYield 1–9, E2 decisions 1–3. Each line (gross, penalty, taxable,
# federal, state, local) is rounded half-up once; net is gross − penalty − taxes of the rounded
# lines; yield = net / principal × 12 / holdingMonths, half-up to 8 decimals.
# Tables are synthetic (single: 10% to $20,000, 20% to $80,000, 30% to $200,000, then 40%).
import json
from decimal import ROUND_HALF_UP, Decimal, getcontext

getcontext().prec = 40

SINGLE_EDGES = [Decimal(0), Decimal(2_000_000), Decimal(8_000_000), Decimal(20_000_000), None]
RATES = [Decimal("0.10"), Decimal("0.20"), Decimal("0.30"), Decimal("0.40")]
STATES = {"CA": Decimal("0.06"), "TX": Decimal(0)}
THREE_TIERS = [(Decimal(0), "0.04"), (Decimal(1_000_000), "0.045"), (Decimal(10_000_000), "0.05")]


def tax(x: Decimal) -> Decimal:
    total = Decimal(0)
    for i, rate in enumerate(RATES):
        lo, hi = SINGLE_EDGES[i], SINGLE_EDGES[i + 1]
        top = x if hi is None else min(x, hi)
        total += max(Decimal(0), top - lo) * rate
    return total


def grow(amount: Decimal, apy: str, years: Decimal) -> Decimal:
    return amount * ((1 + Decimal(apy)) ** years - 1)


def c(x: Decimal) -> int:
    assert abs(abs(x) % 1 - Decimal("0.5")) > Decimal("1e-6"), f"too close to a tie: {x}"
    return int(x.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def rate8(x: Decimal) -> str:
    q = x.quantize(Decimal("1e-8"), rounding=ROUND_HALF_UP)
    return "0" if q == 0 else format(q.normalize(), "f")


def portions(mode, tiers, p):
    if mode == "whole":
        apy = [a for lo, a in tiers if lo <= p][-1]  # adjacent tiers: the last min ≤ P
        return [(p, apy)]
    out = []
    for i, (lo, apy) in enumerate(tiers):
        hi = p if i == len(tiers) - 1 else min(p, tiers[i + 1][0])
        if hi > lo:
            out.append((hi - lo, apy))
    return out


def case(p=1_000_000, apy="0.05", mode="whole", tiers=None, term=12, held=12, penalty=None,
         income=5_000_000, state="CA", city=Decimal(0), exempt=None):
    P = Decimal(p)
    parts = portions(mode, tiers or [(Decimal(0), apy)], P)
    months = held if term is None else min(held, term)
    gross = sum(grow(a, r, Decimal(months) / 12) for a, r in parts)
    pen = Decimal(0)
    if term is not None and held < term and penalty is not None:
        kind, n = penalty
        if kind == "days":
            pen = sum(a * Decimal(r) * n / 365 for a, r in parts)  # simple interest
        elif kind == "months":
            pen = sum(grow(a, r, Decimal(n) / 12) for a, r in parts)
        else:
            pen = P * Decimal(n)
    base = max(Decimal(0), gross - pen)
    fed = Decimal(0) if exempt == "federal" else tax(income + base) - tax(Decimal(income))
    s_rate = Decimal(0) if exempt == "state_local" else STATES[state]
    l_rate = Decimal(0) if exempt == "state_local" else city
    lines = [c(gross), c(pen), c(base), c(fed), c(base * s_rate), c(base * l_rate)]
    net = lines[0] - lines[1] - lines[3] - lines[4] - lines[5]
    return lines + [net, rate8(Decimal(net) / P * 12 / held)]


print(json.dumps({
    "cd12": case(),
    "crossing": case(income=7_980_000),
    "savingsWhole": case(mode="whole", tiers=THREE_TIERS, term=None),
    "savingsMarginal": case(p=15_000_000, mode="marginal", tiers=THREE_TIERS, term=None),
    "treasury": case(term=6, held=6, city=Decimal("0.01"), exempt="state_local"),
    "penaltyDays": case(held=6, penalty=("days", 90)),
    "penaltyMonths": case(held=6, penalty=("months", 6)),
    "penaltyPercent": case(held=6, penalty=("percent", "0.01")),
    "penaltyAboveInterest": case(held=1, penalty=("months", 6)),
    "pastTerm": case(held=18),
    "noStateTax": case(state="TX"),
    "cityRate": case(city=Decimal("0.01")),
    "federalExempt": case(exempt="federal"),
}, indent=1))
