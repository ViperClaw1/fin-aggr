# Independent expected values for mulRate and sumCents. Shares no code with the engine.
# Python decimal, precision 40, ROUND_HALF_UP (away from zero on a tie, like decimal.js).
# Keys match the EXPECTED constant in packages/engine/src/money.golden.test.ts.
import json
from decimal import ROUND_HALF_UP, Decimal, getcontext

getcontext().prec = 40
MAX = 2**53 - 1


def cents(x: Decimal) -> int:
    return int(x.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def mul(amount: int, rate: str) -> int:
    return cents(Decimal(amount) * Decimal(rate))


print(
    json.dumps(
        {
            "halfCentRoundsUp": mul(1, "0.5"),
            "oneAndHalfRoundsUp": mul(3, "0.5"),
            "negativeHalfRoundsAwayFromZero": mul(-1, "0.5"),
            "justBelowHalfRoundsDown": mul(29999, "0.00005"),
            "justAboveHalfRoundsUp": mul(30001, "0.00005"),
            "typicalInterest": mul(123456789, "0.0435"),
            "maxTimesOne": mul(MAX, "1"),
            "sumToMax": cents(Decimal(MAX - 1) + Decimal(1)),
        },
        indent=2,
    )
)
