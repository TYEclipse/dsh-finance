#!/usr/bin/env python3
"""Independent oracle for dsh-finance anchors (savings_goal / inflation_adjust).

Why this file is committed: every numeric expectation in the TypeScript test
suite must come from an *independent* implementation, not from the code under
test and not from someone's mental arithmetic (the "guessed expectation"
failure mode — R19/R21/R27/R30 in the pipeline log). Running this script
reproduces, value by value, the anchors quoted in the headers of
`test/savings.test.ts` and `test/inflation.test.ts`.

The math here is deliberately written from the closed forms and a plain
month-by-month simulation — a different code path from `src/savings.ts` and
`src/inflation.ts`. It also prints the derived/secondary cases that the tests
assert (projections, already-reached, dead ends), because those are exactly
where hand-written expectations sneak back in.

Usage: python3 test/oracle/anchors.py
"""

import math

EPS = 2.220446049250313e-16  # Number.EPSILON, so rounding matches the TS boundary


def round2(x: float) -> float:
    """Round to cents the way src/finance.ts does at the output boundary."""
    return math.floor((x + EPS) * 100 + 0.5) / 100


def round6(x: float) -> float:
    return math.floor((x + EPS) * 1e6 + 0.5) / 1e6


# ── savings_goal ───────────────────────────────────────────────────────────
def simulate_to_target(target, current, rate_pct, contribution, cap=1200):
    """Month-end contributions until the balance first reaches the target.

    A balance that already meets the target is reported at month 0 (the
    implementation's documented convention), not as "one more month".
    """
    if current >= target:
        return 0, round2(current), round2(current), 0.0
    r = rate_pct / 100 / 12
    balance = current
    for month in range(1, cap + 1):
        balance = balance * (1 + r) + contribution
        if balance >= target:
            total = current + contribution * month
            return month, round2(balance), round2(total), round2(balance - total)
    return None


def required_contribution(target, current, rate_pct, months):
    """Annuity closed form, rounded UP to the cent (a real plan needs whole cents)."""
    r = rate_pct / 100 / 12
    growth = (1 + r) ** months
    exact = (target - current * growth) * r / (growth - 1) if r else (target - current) / months
    exact = max(exact, 0.0)
    return math.ceil(exact * 100 - 1e-9) / 100


def project(current, rate_pct, months, contribution):
    """Balance after exactly `months` month-end contributions (no early exit)."""
    r = rate_pct / 100 / 12
    balance = current
    for _ in range(months):
        balance = balance * (1 + r) + contribution
    return round2(balance), round2(balance - (current + contribution * months))


# ── inflation_adjust ───────────────────────────────────────────────────────
def inflation(amount, inflation_pct, years, nominal_pct=None):
    i = inflation_pct / 100
    deflator = (1 + i) ** years
    out = {
        "months": round(years * 12),
        "future_cost": round2(amount * deflator),
        "real_value": round2(amount / deflator),
    }
    if nominal_pct is not None:
        real_rate = (1 + nominal_pct / 100) / (1 + i) - 1  # full precision internally
        out["real_rate_percent"] = round6(real_rate * 100)
        out["nominal_future_value"] = round2(amount * (1 + nominal_pct / 100) ** years)
        out["real_future_value"] = round2(amount * (1 + real_rate) ** years)
    return out


A_CASES = [
    ("A1", 50000, 10000, 5, 500),
    ("A2", 12000, 0, 0, 1000),
    ("A3", 5000, 6000, 3, 100),        # already reached
    ("A4", 100000, 1000, 0, 0),        # dead end
    ("A5", 20000, 10000, -2, 600),     # negative rate
    ("A6", 1000, 0, -50, 150),         # negative rate, needs 8 months
    ("A7", 1000, 0, -50, 100),         # negative rate, needs 13 months
]

B_CASES = [
    ("B1", 100000, 20000, 6, 240),
    ("B2", 12000, 0, 0, 24),
    ("B3", 10000, 20000, 5, 60),       # already funded
    ("B4", 50000, 0, 4.8, 12),
    ("B5", 50000, 10000, 5, 66),       # the on-track case
]

I_CASES = [
    ("I1", 1000, 2.5, 10, None),
    ("I2", 1000, 2.5, 10, 6),
    ("I3", 100000, 0, 5, 7),
    ("I4", 100000, 3, 30, 3),
    ("I5", 5000, -1, 2, None),
    ("I6", 1000, 2, 0.5, None),
    ("I7", 1200, 6, 1 / 12, None),
]


def main() -> None:
    print("== savings_goal — months to goal (simulated) ==")
    for tag, target, current, rate, contribution in A_CASES:
        result = simulate_to_target(target, current, rate, contribution)
        print(f"{tag} target={target} current={current} rate={rate}%/yr contribution={contribution}"
              f" -> {result if result else 'unreachable within 100 years'}")

    print("== savings_goal — required contribution (closed form, ceil to cent) ==")
    for tag, target, current, rate, months in B_CASES:
        required = required_contribution(target, current, rate, months)
        projected, interest = project(current, rate, months, required)
        print(f"{tag} target={target} current={current} rate={rate}% months={months}"
              f" -> required={required:.2f} projected_balance={projected} projected_interest={interest}")

    print("== inflation_adjust ==")
    for tag, amount, infl, years, nominal in I_CASES:
        print(f"{tag} amount={amount} inflation={infl}% years={years} nominal={nominal} -> {inflation(amount, infl, years, nominal)}")


if __name__ == "__main__":
    main()
