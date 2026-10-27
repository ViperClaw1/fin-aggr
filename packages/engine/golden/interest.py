# Independent expected values for computeInterest (gross and penalty, in cents, half-up).
# Shares no code with the engine. Formula from spec §5 rule 2: P * ((1 + apy)^(t) - 1),
# t = months / 12 (E2 decision 2). A penalty in days is simple interest: P * apy * days / 365.
# Marginal portions follow E2 decision 1.
# Each value is checked to be at least 1e-6 cent away from a half-cent tie: two pow
# implementations may differ in the last digits only there.
import json
from decimal import ROUND_HALF_UP, Decimal, getcontext

getcontext().prec = 40


def grow(amount: Decimal, apy: str, years: Decimal) -> Decimal:
    return amount * ((1 + Decimal(apy)) ** years - 1)


def cents(x: Decimal) -> int:
    frac = abs(x) % 1
    assert abs(frac - Decimal("0.5")) > Decimal("1e-6"), f"too close to a tie: {x}"
    return int(x.quantize(Decimal(1), rounding=ROUND_HALF_UP))


M = lambda months: Decimal(months) / 12  # noqa: E731
P = Decimal(1_000_000)  # $10,000.00

# three tiers: [0, 9999.99] 4%, [10000, 99999.99] 4.5%, [100000, ∞) 5%
MINS = [Decimal(0), Decimal(1_000_000), Decimal(10_000_000)]
APYS = ["0.04", "0.045", "0.05"]


def marginal(principal: int, years: Decimal) -> Decimal:
    p = Decimal(principal)
    total = Decimal(0)
    for i, (lo, apy) in enumerate(zip(MINS, APYS)):
        hi = p if i == len(MINS) - 1 else min(p, MINS[i + 1])
        if hi > lo:
            total += grow(hi - lo, apy, years)
    return total


out = {
    "cd.6m": cents(grow(P, "0.05", M(6))),
    "cd.12m": cents(grow(P, "0.05", M(12))),
    "cd.18m": cents(grow(P, "0.05", M(18))),
    "whole.atTierMax": cents(grow(Decimal(999_999), "0.04", M(12))),
    "whole.centAbove": cents(grow(Decimal(1_000_000), "0.045", M(12))),
    "marginal.atTierMin": cents(marginal(1_000_000, M(12))),
    "marginal.centAbove": cents(marginal(1_000_001, M(12))),
    "marginal.allThree": cents(marginal(15_000_000, M(12))),
    "penalty.days90": cents(P * Decimal("0.05") * 90 / 365),  # simple interest
    "penalty.months6": cents(grow(P, "0.05", M(6))),
    "penalty.percent1": cents(P * Decimal("0.01")),
    "cd.1m": cents(grow(P, "0.05", M(1))),
}
print(json.dumps(out, indent=2))
