# Independent expected values for bracketTax / taxesOnInterest. Shares no code with the engine.
# Synthetic tables (not IRS values), the same numbers as TABLES in tax.golden.test.ts.
# Amounts in cents; printed as plain decimal strings (unrounded) so the bracket edge stays visible.
import json
from decimal import Decimal, getcontext

getcontext().prec = 40

RATES = [Decimal("0.10"), Decimal("0.20"), Decimal("0.30"), Decimal("0.40")]
BOUNDS_DOLLARS = {
    "single": [20000, 80000, 200000],
    "married_joint": [40000, 160000, 400000],
    "married_separate": [20000, 80000, 200000],
    "head_of_household": [30000, 100000, 200000],
}
STATES = {"CA": Decimal("0.06"), "TX": Decimal("0")}


def tax(status: str, income: Decimal) -> Decimal:
    edges = [Decimal(0)] + [Decimal(b * 100) for b in BOUNDS_DOLLARS[status]] + [None]
    total = Decimal(0)
    for i, rate in enumerate(RATES):
        lo, hi = edges[i], edges[i + 1]
        top = income if hi is None else min(income, hi)
        total += max(Decimal(0), top - lo) * rate
    return total


def s(x: Decimal) -> str:
    return format(x.normalize(), "f")


def federal(status: str, income: int, interest: int) -> str:
    return s(tax(status, Decimal(income) + interest) - tax(status, Decimal(income)))


out = {}
for status, bounds in BOUNDS_DOLLARS.items():
    edge = bounds[0] * 100
    out[f"{status}.oneCentAtEdge"] = federal(status, edge - 1, 1)
    out[f"{status}.oneCentAboveEdge"] = federal(status, edge, 1)

BASE = 123457
out["crossing.federal"] = federal("single", 7950000, BASE)
out["ca.state"] = s(BASE * STATES["CA"])
out["ca.local"] = s(BASE * Decimal("0.01"))
out["tx.state"] = s(BASE * STATES["TX"])
print(json.dumps(out, indent=2))
