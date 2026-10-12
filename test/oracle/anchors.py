#!/usr/bin/env python3
"""Independent oracle for dsh-finance anchors.

Why this file is committed: every numeric expectation in the TypeScript test
suite must come from an *independent* implementation, not from the code under
test and not from someone's mental arithmetic (the "guessed expectation"
failure mode — R19/R21/R27/R30/R46 in the pipeline log). Running this script
reproduces, value by value, the anchors quoted in the test files:

  A/B  savings_goal              test/savings.test.ts
  I    inflation_adjust          test/inflation.test.ts
  L    loan_payment              test/finance.test.ts
  G    compound_growth           test/finance.test.ts
  R    rate_convert              test/finance.test.ts
  C    cashflow_analysis         test/cashflow.test.ts
  T    retirement_plan           test/retirement.test.ts
  D    debt_payoff               test/debt.test.ts

The math here is deliberately written from the closed forms and plain
month-by-month simulations — a different code path from `src/*.ts`. It also
prints the derived/secondary cases the tests assert (projections, already
reached, dead ends, payoff orders), because those are exactly where
hand-written expectations sneak back in.

Usage:
  python3 test/oracle/anchors.py            # human-readable anchor dump
  python3 test/oracle/anchors.py --check    # self-check: identities and
                                            # published values; exit 1 on
                                            # failure
"""

import math
import sys

EPS = 2.220446049250313e-16  # Number.EPSILON, so rounding matches the TS boundary
MAX_GOAL_MONTHS = 1200
MAX_PAYOFF_MONTHS = 1200
ZERO_EPS = 1e-9


def round2(x: float) -> float:
    """Round to cents the way src/finance.ts does at the output boundary."""
    return math.floor((x + EPS) * 100 + 0.5) / 100


def round4(x: float) -> float:
    return math.floor((x + EPS) * 1e4 + 0.5) / 1e4


def round6(x: float) -> float:
    return math.floor((x + EPS) * 1e6 + 0.5) / 1e6


def round_money(x: float) -> float:
    """round2 plus the -0 fold src/debt.ts applies to money fields."""
    rounded = round2(x)
    return 0.0 if rounded == 0 else rounded


# ── savings_goal ───────────────────────────────────────────────────────────
def simulate_to_target(target, current, rate_pct, contribution, cap=MAX_GOAL_MONTHS):
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


# ── loan_payment ───────────────────────────────────────────────────────────
def loan_payment_closed(principal, rate_pct, months):
    r = rate_pct / 100 / 12
    if r == 0:
        return principal / months
    growth = (1 + r) ** months
    return principal * r * growth / (growth - 1)


def loan(principal, rate_pct, months, extra=0.0, schedule=False, cap=360):
    """Full loan plan: contract payment, totals, the real amortization, rows."""
    r = rate_pct / 100 / 12
    payment = round2(loan_payment_closed(principal, rate_pct, months))
    contract_total = round2(payment * months)
    contract_interest = round2(contract_total - principal)

    balance = principal
    month = 0
    interest_sum = 0.0
    rows = []
    truncated = False
    while balance > 0 and month < months:
        month += 1
        interest = balance * r
        pay = payment + extra
        if pay > balance + interest:
            pay = balance + interest
        principal_paid = pay - interest
        balance -= principal_paid
        if balance < 1e-9:
            balance = 0
        interest_sum += interest
        if schedule:
            if len(rows) < cap:
                rows.append({
                    "month": month,
                    "payment": round2(pay),
                    "principal": round2(principal_paid),
                    "interest": round2(interest),
                    "balance": round2(balance),
                })
            else:
                truncated = True
    out = {
        "monthly_payment": payment,
        "total_paid": contract_total,
        "total_interest": contract_interest,
        "payoff_months": month,
        "interest_sum_full": round(interest_sum, 6),
    }
    if extra > 0:
        out["months_saved"] = months - month
        out["interest_saved"] = round2(contract_interest - interest_sum)
    if schedule:
        out["rows"] = rows
        out["truncated"] = truncated
    return out


# ── compound_growth ────────────────────────────────────────────────────────
PERIODS = {"daily": 365, "monthly": 12, "quarterly": 4, "semiannually": 2, "annually": 1}


def monthly_rate(rate_pct, compounding):
    rate = rate_pct / 100
    if compounding == "continuous":
        return math.exp(rate / 12) - 1
    periods = PERIODS[compounding]
    return (1 + rate / periods) ** (periods / 12) - 1


def growth(principal, rate_pct, years, compounding, contribution=0.0, breakdown=False):
    months = round(years * 12)
    r = monthly_rate(rate_pct, compounding)
    g = (1 + r) ** months
    fv = principal + contribution * months if r == 0 else principal * g + contribution * ((g - 1) / r)
    total_contributions = principal + contribution * months
    out = {
        "months": months,
        "future_value": round2(fv),
        "total_contributions": round2(total_contributions),
        "interest_earned": round2(fv - total_contributions),
    }
    if breakdown:
        cap = min(60, math.ceil(months / 12))
        rows = []
        balance = principal
        for block in range(cap):
            year_months = months - block * 12 if block + 1 == cap else min(12, months - block * 12)
            contributed = 0.0
            for _ in range(year_months):
                balance = balance * (1 + r) + contribution
                contributed += contribution
            rows.append({
                "year": block + 1,
                "balance": round2(balance),
                "contributions": round2(contributed),
                "interest": round2(balance - (principal + contribution * (block * 12 + year_months))),
            })
        out["breakdown"] = rows
    return out


# ── rate_convert ───────────────────────────────────────────────────────────
def nominal_to_effective(nominal_pct, periods_per_year):
    rate = nominal_pct / 100
    if periods_per_year <= 0:
        return float("nan")
    return round6(((1 + rate / periods_per_year) ** periods_per_year - 1) * 100)


def effective_to_nominal(effective_pct, periods_per_year):
    rate = effective_pct / 100
    if periods_per_year <= 0 or rate <= -1:
        return float("nan")
    return round6(periods_per_year * ((1 + rate) ** (1 / periods_per_year) - 1) * 100)


def continuous_nominal_to_effective(nominal_pct):
    return round6((math.exp(nominal_pct / 100) - 1) * 100)


def continuous_effective_to_nominal(effective_pct):
    rate = effective_pct / 100
    if rate <= -1:
        return float("nan")
    return round6(math.log(1 + rate) * 100)


# ── cashflow_analysis ──────────────────────────────────────────────────────
def npv_at(flows, rate):
    total = 0.0
    for t, flow in enumerate(flows):
        total += flow / (1 + rate) ** t
    return total


def count_sign_changes(flows):
    changes = 0
    previous = 0
    for flow in flows:
        if flow == 0:
            continue
        if previous != 0 and flow * previous < 0:
            changes += 1
        previous = flow
    return changes


def find_irr(flows):
    """Bisection over (-99.9%, 1000%]; the top of the bracket grows ×10."""
    lo = -0.999
    flo = npv_at(flows, lo)
    hi = 10
    for _ in range(7):
        fhi = npv_at(flows, hi)
        if flo * fhi <= 0:
            a, b = lo, hi
            for _ in range(300):
                mid = (a + b) / 2
                if mid == a or mid == b:
                    break
                fm = npv_at(flows, mid)
                if fm == 0:
                    return mid
                if flo * fm <= 0:
                    b = mid
                else:
                    a = mid
                    flo = fm
            return (a + b) / 2
        hi *= 10
    return None


def simple_payback(flows):
    cumulative = 0.0
    for t, flow in enumerate(flows):
        previous = cumulative
        cumulative += flow
        if previous < 0 and cumulative >= 0:
            return t if flow == 0 else t - 1 + -previous / flow
    return None


def discounted_payback(flows, rate):
    cumulative = 0.0
    for t, flow in enumerate(flows):
        discounted = flow / (1 + rate) ** t
        previous = cumulative
        cumulative += discounted
        if previous < 0 and cumulative >= 0:
            return t if discounted == 0 else t - 1 + -previous / discounted
    return None


def cashflow(flows, rate_pct=None):
    out = {
        "periods": len(flows) - 1,
        "total_inflow": round2(sum(f for f in flows if f > 0)),
        "total_outflow": round2(-sum(f for f in flows if f < 0)),
        "net_cashflow": round2(sum(flows)),
    }
    if rate_pct is not None:
        out["npv"] = round2(npv_at(flows, rate_pct / 100))
    changes = count_sign_changes(flows)
    if changes == 1:
        irr = find_irr(flows)
        out["irr_percent"] = None if irr is None else round6(irr * 100)
    else:
        out["irr_percent"] = None
        out["sign_changes"] = changes
    payback = simple_payback(flows)
    if payback is not None:
        out["payback_periods"] = round4(payback)
    if rate_pct is not None:
        discounted = discounted_payback(flows, rate_pct / 100)
        if discounted is not None:
            out["discounted_payback_periods"] = round4(discounted)
    return out


# ── retirement_plan ────────────────────────────────────────────────────────
def retirement(principal, rate_pct, withdrawal=None, years=None):
    r = rate_pct / 100 / 12
    out = {}
    if withdrawal is not None:
        out["withdrawal_rate_percent"] = round6(withdrawal * 12 / principal * 100)
        if r == 0:
            months = principal / withdrawal
            out["months_to_exhaust"] = round2(months)
            out["years_to_exhaust"] = round2(months / 12)
            exhaust = out["months_to_exhaust"]
        elif withdrawal <= principal * r:
            out["never_exhausts"] = True
            exhaust = None
        else:
            months = math.log(withdrawal / (withdrawal - principal * r)) / math.log(1 + r)
            out["months_to_exhaust"] = round2(months)
            out["years_to_exhaust"] = round2(months / 12)
            exhaust = out["months_to_exhaust"]
        if years is not None:
            out["lasts_horizon"] = out.get("never_exhausts", False) or (
                exhaust is not None and exhaust >= years * 12
            )
    if years is not None:
        months = round(years * 12)
        if r == 0:
            sustainable = principal / months
        else:
            g = (1 + r) ** months
            sustainable = principal * r * g / (g - 1)
        rounded = round2(sustainable)
        out["horizon_months"] = months
        out["horizon_years"] = years
        out["sustainable_monthly_withdrawal"] = rounded
        out["total_withdrawn"] = round2(rounded * months)
        out["interest_earned"] = round2(rounded * months - principal)
    return out


# ── debt_payoff ────────────────────────────────────────────────────────────
def debt_payoff(debts, budget, strategy="avalanche"):
    """Month-by-month payoff simulation; debts = (name, balance, rate %, minimum)."""
    normal = [(name, balance, rate_pct / 100 / 12, minimum) for name, balance, rate_pct, minimum in debts]
    count = len(normal)

    def simulate(which):
        balances = [d[1] for d in normal]
        interest_paid = [0.0] * count
        paid = [0.0] * count
        cleared = [0] * count
        order = []
        interest_total = 0.0
        paid_total = 0.0
        last_month = 0
        for month in range(1, MAX_PAYOFF_MONTHS + 1):
            open_idx = [i for i in range(count) if balances[i] > 0]
            if not open_idx:
                break
            for i in open_idx:
                interest = balances[i] * normal[i][2]
                balances[i] += interest
                interest_paid[i] += interest
                interest_total += interest
            remaining = budget
            for i in range(count):
                if balances[i] <= 0:
                    continue
                pay = min(normal[i][3], balances[i])
                if pay > remaining:
                    pay = remaining
                balances[i] -= pay
                paid[i] += pay
                paid_total += pay
                remaining -= pay
            if which == "avalanche":
                targets = sorted(open_idx, key=lambda i: (-normal[i][2], i))
            else:
                targets = sorted(open_idx, key=lambda i: (balances[i], i))
            for i in targets:
                if remaining <= ZERO_EPS:
                    break
                if balances[i] <= 0:
                    continue
                pay = min(remaining, balances[i])
                balances[i] -= pay
                paid[i] += pay
                paid_total += pay
                remaining -= pay
            for i in range(count):
                if balances[i] > 0 and balances[i] < ZERO_EPS:
                    balances[i] = 0
                if balances[i] == 0 and cleared[i] == 0:
                    cleared[i] = month
                    order.append({
                        "name": normal[i][0],
                        "cleared_month": month,
                        "interest_paid": round_money(interest_paid[i]),
                        "paid": round_money(paid[i]),
                    })
            last_month = month
            if all(value > 0 for value in cleared):
                break
        debt_free = last_month > 0 and all(value > 0 for value in cleared)
        return {
            "strategy": which,
            "debt_free": debt_free,
            "months_to_debt_free": last_month if debt_free else None,
            "total_paid": round_money(paid_total) if debt_free else None,
            "total_interest": round_money(interest_total) if debt_free else None,
            "interest_full": interest_total,
            "payoff_order": sorted(order, key=lambda row: row["cleared_month"]),
        }

    def priority(which):
        idx = list(range(count))
        if which == "avalanche":
            idx.sort(key=lambda i: (-normal[i][2], i))
        else:
            idx.sort(key=lambda i: (normal[i][1], i))
        return [normal[i][0] for i in idx]

    primary = simulate(strategy)
    other = simulate("snowball" if strategy == "avalanche" else "avalanche")
    out = {
        "monthly_budget": round_money(budget),
        "debt_count": count,
        "total_balance": round_money(sum(d[1] for d in normal)),
        "total_minimums": round_money(sum(d[3] for d in normal)),
        "extra_per_month": round_money(budget - sum(d[3] for d in normal)),
        "strategy": strategy,
        "priority_order": priority(strategy),
        "primary": primary,
        "other": other,
    }
    if primary["debt_free"] and other["debt_free"]:
        if primary["total_interest"] == other["total_interest"]:
            out["best_strategy"] = "tie"
        else:
            out["best_strategy"] = primary["strategy"] \
                if primary["total_interest"] < other["total_interest"] else other["strategy"]
        # Derived from the two *reported* totals, so the saving a reader works
        # out from the screen actually reconciles (rounding can move it by at
        # most one cent from the full-precision difference).
        out["interest_saved_by_best"] = round_money(abs(primary["total_interest"] - other["total_interest"]))
        out["months_saved_by_best"] = abs(primary["months_to_debt_free"] - other["months_to_debt_free"])
    return out


def single_debt_payoff_months(balance, rate_pct, payment):
    """Closed-form month a single level payment clears the balance.

    Loop-free cross-check for the simulation: with r > 0 and P > B·r the
    balance hits zero at the smallest k with (1+r)^k >= P/(P − B·r).
    """
    r = rate_pct / 100 / 12
    if r == 0:
        return math.ceil(balance / payment - 1e-12)
    if payment <= balance * r:
        return None
    k = 1
    threshold = payment / (payment - balance * r) - 1e-12
    while (1 + r) ** k < threshold:
        k += 1
        if k > MAX_PAYOFF_MONTHS:
            return None
    return k


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

L_CASES = [
    ("L1", 300000, 4, 360, 0, False),
    ("L2", 100000, 6, 120, 0, False),
    ("L3", 12000, 0, 12, 0, False),
    ("L4", 100000, -1, 120, 0, False),
    ("L5", 300000, 4, 360, 0, True),      # schedule: 360 rows, balance clears
    ("L6", 300000, 4, 360, 100, False),   # extra principal: 318 months
    ("L7", 100000, 5, 600, 0, True),      # schedule capped at 360 rows
]

G_CASES = [
    ("G1", 1000, 5, 10, "monthly", 0, False),
    ("G2", 1000, 5, 10, "monthly", 100, False),
    ("G3", 1000, 0, 10, "monthly", 100, False),
    ("G4", 1000, 5, 1, "daily", 0, False),
    ("G5", 1000, 10, 1, "continuous", 0, False),
    ("G6", 1000, 10, 1, "monthly", 0, False),
    ("G7", 1000, 10, 1, "daily", 0, False),
    ("G8", 1000, 5, 3, "monthly", 100, True),
    ("G9", 1000, 5, 2.5, "monthly", 0, False),
]

C_CASES = [
    ("C1", [-70000, 12000, 15000, 18000, 21000, 26000], 8),
    ("C2", [-1000, 400, 400, 400, 400], 10),
    ("C3", [-1000, 400, 400, 400, 400], 0),
    ("C4", [-1000, 400, 400, 400, 400], -5),
    ("C5", [-70000, 12000, 15000, 18000, 21000, 26000], None),
    ("C6", [-100, 110], None),
    ("C7", [-1000, 500, 400, 300], None),
    ("C8", [-1000, 300, 300, 300, 300], None),
    ("C9", [-5000, 2000, 2000, 2000], None),
    ("C10", [-100, 60, 60, 60], None),
    ("C11", [-1000, 1000], None),
    ("C12", [100, 50, 50], 0),
    ("C13", [-100, 230, -132], 8),
    ("C14", [-1, 1000], None),
    ("C15", [-1000, 400, 400, 400, 400], None),
]

T_CASES = [
    ("T1", 1_000_000, 4, None, 30),
    ("T2", 300_000, 4, None, 30),
    ("T3", 1_000_000, 0, None, 30),
    ("T4", 12_000, 0, None, 1),
    ("T5", 1_000_000, -1, None, 30),
    ("T6", 1_000_000, 4, 4000, None),
    ("T7", 1_000_000, 4, 3333.33, None),
    ("T8", 1_000_000, 4, 4774.152955, None),
    ("T9", 100_000, 0, 2000, None),
    ("T10", 1_000_000, -1, 3000, None),
    ("T11", 1_000_000, 4, 4000, 30),
    ("T12", 1_000_000, 4, 5000, 30),
    ("T13", 1_000_000, 4, 3000, 30),
    ("T14", 1_000_000, 4, 4000, 20),
]

D_CASES = [
    # tag, debts (name, balance, rate %, minimum), budget, strategy
    ("D1", [("card A", 5000, 22, 100), ("card B", 2000, 12, 50)], 600, "avalanche"),
    ("D2", [("loan", 1200, 0, 100)], 300, "avalanche"),
    ("D3", [("store card", 1000, 24, 10)], 10, "avalanche"),
    ("D4", [("one", 1000, 18, 50), ("two", 2000, 18, 50)], 200, "avalanche"),
    ("D5", [("visa", 8000, 19.99, 160), ("car", 1200, 9, 25), ("student", 15000, 5.5, 200)], 800, "snowball"),
    ("D6", [("tiny", 10, 30, 5)], 5, "avalanche"),
    ("D7", [("small low-rate", 500, 5, 250), ("big high-rate", 10000, 25, 100)], 400, "avalanche"),
    ("D8", [("a", 3000, 20, 75), ("b", 3000, 20, 75), ("c", 3000, 20, 75)], 300, "avalanche"),
]


def dump() -> None:
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
        print(f"{tag} amount={amount} inflation={infl}% years={years} nominal={nominal}"
              f" -> {inflation(amount, infl, years, nominal)}")

    print("== loan_payment ==")
    for tag, principal, rate, months, extra, schedule in L_CASES:
        out = loan(principal, rate, months, extra, schedule)
        summary = {k: v for k, v in out.items() if k not in ("rows",)}
        print(f"{tag} principal={principal} rate={rate}% months={months} extra={extra} schedule={schedule}"
              f" -> {summary}")
        if schedule:
            rows = out["rows"]
            print(f"   rows={len(rows)} first={rows[0]} last={rows[-1]}"
                  f" principal_sum_rounded={round(sum(row['principal'] for row in rows), 2)}")

    print("== compound_growth ==")
    for tag, principal, rate, years, compounding, contribution, breakdown in G_CASES:
        out = growth(principal, rate, years, compounding, contribution, breakdown)
        summary = {k: v for k, v in out.items() if k != "breakdown"}
        print(f"{tag} principal={principal} rate={rate}% years={years} {compounding}"
              f" contribution={contribution} breakdown={breakdown} -> {summary}")
        if breakdown:
            print(f"   breakdown={out['breakdown']}")

    print("== rate_convert ==")
    for nominal, periods in [(12, 12), (8, 4), (-12, 12), (0, 12)]:
        print(f"nominal={nominal}% {periods}/yr -> effective={nominal_to_effective(nominal, periods)}"
              f" round_trip={effective_to_nominal(nominal_to_effective(nominal, periods), periods)}")
    print(f"effective=0% 12/yr -> nominal={effective_to_nominal(0, 12)}")
    print(f"continuous nominal=10% -> effective={continuous_nominal_to_effective(10)}")
    print(f"continuous effective=10.517092% -> nominal={continuous_effective_to_nominal(10.517092)}")
    print(f"compounding periods per year = {PERIODS}")
    for compounding in ("monthly", "quarterly", "annually"):
        r = monthly_rate(12, compounding)
        print(f"monthlyRateFor(12, {compounding}) = {r:.12f} composes to {(1 + r) ** 12 - 1:.12f}"
              f" (raw {r!r} / {(1 + r) ** 12 - 1!r})")

    print("== cashflow_analysis ==")
    for tag, flows, rate in C_CASES:
        print(f"{tag} flows={flows} rate={rate} -> {cashflow(flows, rate)}")

    print("== retirement_plan ==")
    for tag, principal, rate, withdrawal, years in T_CASES:
        print(f"{tag} principal={principal} rate={rate}% withdrawal={withdrawal} years={years}"
              f" -> {retirement(principal, rate, withdrawal, years)}")

    print("== debt_payoff ==")
    for tag, debts, budget, strategy in D_CASES:
        out = debt_payoff(debts, budget, strategy)
        print(f"{tag} budget={budget} strategy={strategy} debts={debts}")
        print(f"   priority={out['priority_order']} total_balance={out['total_balance']}"
              f" total_minimums={out['total_minimums']} extra={out['extra_per_month']}")
        for outcome in (out["primary"], out["other"]):
            print(f"   {outcome['strategy']}: debt_free={outcome['debt_free']}"
                  f" months={outcome['months_to_debt_free']} total_paid={outcome['total_paid']}"
                  f" total_interest={outcome['total_interest']}")
            for row in outcome["payoff_order"]:
                print(f"      {row}")
        if "best_strategy" in out:
            print(f"   best={out['best_strategy']} interest_saved_by_best={out['interest_saved_by_best']}"
                  f" months_saved_by_best={out['months_saved_by_best']}")

    print("== debt_payoff — single-debt closed-form cross-check ==")
    for balance, rate, payment in [(1200, 0, 300), (5000, 22, 600), (10, 30, 5), (500, 5, 400)]:
        closed = single_debt_payoff_months(balance, rate, payment)
        sim = debt_payoff([("x", balance, rate, payment)], payment, "avalanche")["primary"]
        print(f"balance={balance} rate={rate}% payment={payment} -> closed_form={closed}"
              f" simulated={sim['months_to_debt_free']} interest={sim['total_interest']}")


def check() -> int:
    """Self-check on definitions and published values, not self-comparison.

    A wrong constant shared by the oracle and the implementation passes both,
    so every check below is anchored either to a definition or to a published
    number (mortgage tables, Excel's IRR example, textbook EAR pairs).
    """
    failures = []

    def expect(name, got, want, tol=1e-9):
        if got is None or want is None:
            ok = got is want
        else:
            ok = abs(got - want) <= tol
        print(f"  {'ok  ' if ok else 'FAIL'} {name}: got={got!r} want={want!r} tol={tol}")
        if not ok:
            failures.append(name)

    # loan_payment — published mortgage tables + schedule invariants
    expect("PMT(300000, 4%, 360) = 1432.25 (published table)", round2(loan_payment_closed(300000, 4, 360)), 1432.25, 1e-9)
    expect("PMT(100000, 6%, 120) = 1110.21 (published table)", round2(loan_payment_closed(100000, 6, 120)), 1110.21, 1e-9)
    expect("PMT at 0% = principal / months", round2(loan_payment_closed(12000, 0, 12)), 1000.0, 1e-9)
    schedule = loan(300000, 4, 360, 0, True)
    expect("schedule row count = term", len(schedule["rows"]), 360, 0)
    expect("last schedule row clears the balance", schedule["rows"][-1]["balance"], 0.0, 0.0)
    expect("principal sum ≈ loan (cents dust only)", sum(r["principal"] for r in schedule["rows"]), 300000.0, 0.5)
    expect("first-row interest = 300000·4%/12", schedule["rows"][0]["interest"], 1000.0, 0.01)
    expect("extra=100 payoff = 318 months (closed form)", loan(300000, 4, 360, 100)["payoff_months"], 318, 0)
    expect("extra=100 interest saved ≈ 28749.08", loan(300000, 4, 360, 100)["interest_saved"], 28749.08, 0.01)

    # compound_growth — definition identities
    expect("FV(0%) = principal + contributions", growth(1000, 0, 10, "monthly", 100)["future_value"], 13000.0, 0.0)
    expect("continuous FV = 1000·e^0.1", growth(1000, 10, 1, "continuous")["future_value"],
           round2(1000 * math.exp(0.1)), 0.01)
    expect("daily FV = 1000·(1+0.05/365)^365", growth(1000, 5, 1, "daily")["future_value"],
           round2(1000 * (1 + 0.05 / 365) ** 365), 0.01)
    expect("monthly FV = 1000·(1+0.05/12)^120", growth(1000, 5, 10, "monthly")["future_value"],
           round2(1000 * (1 + 0.05 / 12) ** 120), 0.01)

    # rate_convert — textbook pair + round-trip identities
    expect("12% nominal monthly → 12.682503% EAR (textbook)", nominal_to_effective(12, 12), 12.682503, 1e-6)
    expect("EAR round-trips back to 12% nominal", effective_to_nominal(nominal_to_effective(12, 12), 12), 12.0, 0.001)
    expect("continuous 10% → e^0.1 − 1 = 10.517092%", continuous_nominal_to_effective(10),
           round6((math.exp(0.1) - 1) * 100), 1e-6)
    expect("continuous round-trip returns 10%", continuous_effective_to_nominal(continuous_nominal_to_effective(10)), 10.0, 0.001)

    # cashflow_analysis — published IRR example + root identities
    excel = [-70000, 12000, 15000, 18000, 21000, 26000]
    expect("Excel IRR example = 8.663095%", cashflow(excel)["irr_percent"], 8.663095, 1e-6)
    expect("[-100, 110] IRR = 10%", cashflow([-100, 110])["irr_percent"], 10.0, 1e-6)
    expect("NPV at the reported IRR is 0", npv_at(excel, find_irr(excel)), 0.0, 1e-6)
    expect("payback of [-1000, 400 ×4] = 2.5 periods", cashflow([-1000, 400, 400, 400, 400])["payback_periods"], 2.5, 1e-9)

    # retirement_plan — the safe-withdrawal anchor is the loan PMT identity
    expect("sustainable 300k @ 4% / 30y = PMT anchor 1432.25",
           retirement(300000, 4, years=30)["sustainable_monthly_withdrawal"], 1432.25, 0.005)
    expect("0% return is principal / months", retirement(12000, 0, years=1)["sustainable_monthly_withdrawal"], 1000.0, 0.0)
    expect("interest-only withdrawal never exhausts",
           1 if retirement(1000000, 4, withdrawal=3333.33).get("never_exhausts") else 0, 1, 0)

    # debt_payoff — closed form against the simulation, plus internal identities
    for balance, rate, payment in [(1200, 0, 300), (5000, 22, 600), (10, 30, 5), (500, 5, 400)]:
        closed = single_debt_payoff_months(balance, rate, payment)
        sim = debt_payoff([("x", balance, rate, payment)], payment, "avalanche")["primary"]
        expect(f"single debt {balance} @ {rate}% payment={payment}: closed form == simulation",
               sim["months_to_debt_free"], closed, 0)
    one = debt_payoff([("x", 5000, 22, 100)], 600, "avalanche")["primary"]
    expect("total_paid = balance + total_interest (cents)", one["total_paid"], round2(5000 + one["interest_full"]), 0.01)
    for tag, debts, budget, _strategy in D_CASES:
        out = debt_payoff(debts, budget, "avalanche")
        avalanche, snowball = out["primary"], out["other"]
        if not avalanche["debt_free"]:
            expect(f"{tag}: a plan that never clears reports no month count", avalanche["months_to_debt_free"], None, 0)
            continue
        expect(f"{tag}: payoff order ends at months_to_debt_free",
               avalanche["payoff_order"][-1]["cleared_month"], avalanche["months_to_debt_free"], 0)
        expect(f"{tag}: every debt appears exactly once", len(avalanche["payoff_order"]), len(debts), 0)
        if avalanche["total_interest"] is not None and snowball["total_interest"] is not None:
            expect(f"{tag}: avalanche never costs more interest than snowball",
                   avalanche["total_interest"], min(avalanche["total_interest"], snowball["total_interest"]), 0.0)
            expect(f"{tag}: reported saving reconciles with the reported totals",
                   out.get("interest_saved_by_best", 0.0),
                   round_money(abs(avalanche["total_interest"] - snowball["total_interest"])), 0.0)
            expect(f"{tag}: rounding moves the saving by at most one cent",
                   out.get("interest_saved_by_best", 0.0),
                   round_money(abs(avalanche["interest_full"] - snowball["interest_full"])), 0.011)

    print(f"--check: {len(failures)} failure(s)" + (f" {failures}" if failures else ""))
    return 1 if failures else 0


def main(argv) -> int:
    if "--check" in argv:
        return check()
    dump()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
