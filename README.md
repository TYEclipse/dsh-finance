# dsh-finance

> Money math toolbox for [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) — loan payments with amortization, compound growth projection, nominal/effective rate conversion, NPV/IRR/payback cash-flow analysis, retirement withdrawal planning, goal-based saving, and inflation-adjusted purchasing power. Zero runtime dependencies, pure arithmetic, fully deterministic.

Agents are bad at money math. "What's the monthly payment on a $300k mortgage at 4% for 30 years?", "what's the IRR of this project?" and "will my savings last 30 years at a 4% withdrawal?" are exactly the questions LLMs miscalculate — compound interest, PMT, IRR and time-to-exhaustion formulas are easy to misremember, and a wrong answer here is a wrong financial decision. This plugin turns those questions into deterministic tool calls.

## Tools

| Tool | Description |
|------|-------------|
| `loan_payment` | Fixed-rate loan payment (PMT) → monthly payment, total paid, total interest. Optional amortization schedule (capped at 360 rows) and/or a constant extra principal payment per month (shortened term, interest saved). |
| `compound_growth` | Future value of a lump sum with optional monthly contributions (ordinary annuity). Supports daily / monthly / quarterly / semiannually / annually / continuous compounding. Optional year-by-year breakdown (capped at 60 rows). |
| `rate_convert` | Nominal (APR) ↔ effective (EAR) annual rate conversion, incl. continuous compounding (EAR = e^r − 1). |
| `cashflow_analysis` | NPV at a discount rate, IRR (bisection), and simple + discounted payback periods for an arbitrary cash-flow series. No-sign-change and multiple-sign-change cases are reported explicitly instead of fabricating a rate. |
| `retirement_plan` | Safe-withdrawal math: time to exhaustion for a fixed monthly withdrawal (4%-rule family), or the sustainable monthly withdrawal that depletes the balance exactly at a horizon (PMT). Withdrawal rate, total withdrawn, interest earned, and a `lasts_horizon` verdict when both inputs are given. |
| `savings_goal` | Goal-based saving: with a monthly contribution, how many months until savings reach a target (`months_to_goal`, final balance, everything paid in, interest earned); with a deadline in months, the contribution needed (`required_monthly_contribution`, rounded up to the cent, plus the projected balance of that exact plan). Give both and it also verdicts `on_track`. Reports `unreachable` when a zero-contribution, zero-return gap can never close. |
| `inflation_adjust` | Purchasing power: the future cost of today's amount, today's value of a future nominal amount, and — with a nominal return — the exact Fisher real return `(1+nominal)/(1+inflation) − 1` plus nominal and real future values side by side. Handles deflation and fractional horizons (0.5 = six months). |

## Why

- **LLMs get these wrong** — compound interest, PMT, EAR conversions, IRR and withdrawal math are classic hallucination territory; this plugin provides exact, tested answers.
- **Zero runtime dependencies** — pure `Math` arithmetic, no network, no filesystem, no dynamic evaluation. Safe to run anywhere.
- **External-anchor tested** — headline numbers are verified against published references (mortgage tables, textbook EAR values, the Excel IRR documentation example) and independent closed-form scripts, never self-roundtrips. The sustainable-withdrawal PMT and the loan PMT cross-check each other.

## Install

```sh
# into the web profile (dsh plugin has no default profile — always pass --profile)
dsh plugin --profile web add github:TYEclipse/dsh-finance
```

Verify the layer mounted:

```sh
dsh --profile web --dump-config | grep '=='
```

## Usage examples

```
What's the monthly payment for a $300,000 mortgage at 4% APR over 30 years?
→ loan_payment { principal: 300000, annual_rate_percent: 4, months: 360 }
→ monthly_payment 1432.25, total_interest 215610, total_paid 515610

I have $1,000 and can add $100/month for 10 years at 5% (monthly compounding). What will I have?
→ compound_growth { principal: 1000, annual_rate_percent: 5, years: 10, compounding: "monthly", contribution_per_month: 100 }
→ future_value 17175.24 (contributions 13000, interest 4175.24)

A loan advertises "12% nominal, compounded monthly". What's the real annual rate?
→ rate_convert { rate_percent: 12, input_kind: "nominal", compounding: "monthly" }
→ output_rate_percent 12.682503 (effective EAR)

Should I fund this project? (Excel's classic IRR example, discounted at 8%)
→ cashflow_analysis { cash_flows: [-70000, 12000, 15000, 18000, 21000, 26000], discount_rate_percent: 8 }
→ npv 1390.96, irr_percent 8.663095, payback_periods 4.15

I have $1,000,000 and want to retire. Can I withdraw $4,000/month at a 4% return for 30 years?
→ retirement_plan { principal: 1000000, annual_rate_percent: 4, monthly_withdrawal: 4000, years: 30 }
→ months_to_exhaust 538.42, withdrawal_rate_percent 4.8, lasts_horizon true
→ (and the sustainable withdrawal for 30 years: 4774.15/month)

I have $10,000 and can put away $500/month at 5%. When do I reach $50,000?
→ savings_goal { target_amount: 50000, current_savings: 10000, annual_rate_percent: 5, monthly_contribution: 500 }
→ months_to_goal 65, final_balance 50341.48 (paid in 42500, interest 7841.48)

I need $100,000 in 20 years and already have $20,000 at 6%. What do I have to save each month?
→ savings_goal { target_amount: 100000, current_savings: 20000, annual_rate_percent: 6, months: 240 }
→ required_monthly_contribution 73.15, projected_balance 100002.38

What does $1,000 today buy in 10 years at 2.5% inflation — and what do I keep if I earn 6%?
→ inflation_adjust { amount: 1000, annual_inflation_percent: 2.5, years: 10, nominal_rate_percent: 6 }
→ future_cost 1280.08, real_value 781.20, real_rate_percent 3.414634, nominal_future_value 1790.85, real_future_value 1399.01
```

## Semantics

- **Money rounding**: amounts are rounded to cents at the output boundary only; internal iterations carry full precision, and the final payment is adjusted to clear the balance exactly.
- **Extra payments**: the contract payment stays fixed; the term shrinks. The tool reports `payoff_months`, `months_saved` and `interest_saved`.
- **Compounding**: `loan_payment` uses monthly compounding of the APR by convention (mortgage standard). `compound_growth` converts any frequency to an effective monthly rate first, so contributions compose exactly. `continuous` uses e^rt.
- **Cash flows**: entry 0 is time 0 (typically the initial outlay, negative); entry t is the flow at the end of period t. IRR is reported only when flows change sign exactly once and a root exists; otherwise a note (`no sign change` / `may not be unique`) is returned. Payback periods are linearly interpolated.
- **Withdrawals**: monthly compounding, withdrawals at month end. A withdrawal at or below interest-only (W ≤ P·r) never depletes (`never_exhausts: true`). Sustainable withdrawal is amortized with the cent-rounded payment, matching bank totals.
- **Saving toward a goal**: monthly compounding, contributions at month end. `months_to_goal` is the first month the balance reaches the target (closed-form value rounded up — a plan needs whole months). `required_monthly_contribution` is the annuity closed form **rounded up to the cent**, and `projected_balance` simulates that exact rounded payment so the pair is self-consistent; a gap that contributions and return can never close is reported as `unreachable` within 100 years rather than an invented month count.
- **Inflation**: compounds annually at the stated rate; the exponent keeps fractional years (the `months` field is a rounded echo only). The real rate is the exact Fisher relation, unrounded internally, so `real_future_value` never inherits the rounding of the displayed `real_rate_percent`. Negative inflation (deflation) is computed, not rejected.
- **Zero interest** is handled exactly (no division by zero): payment = principal ÷ months; exhaustion = principal ÷ withdrawal.
- **Validation**: every tool validates its inputs and returns `valid: false` with a precise reason instead of throwing.

## Limits (by design)

- No fees, taxes, insurance or escrow — pure amortization math.
- Schedule capped at 360 rows, yearly breakdown at 60 rows (see `truncated`).
- No currency conversion — all amounts are in one currency unit.
- Rates below −100% are rejected as nonsensical; anything above is computed exactly.
- No irregular-period cash flows (XIRR/XNPV) — periods are uniform.
- IRR is single-valued by convention: flows that change sign more than once are flagged rather than given an arbitrary root.

## 中文简介

dsh-finance 是 DeepSeek Harness 的金融数学工具箱（v0.3.0）：贷款月供与摊销表、复利增长、名义/实际利率换算、现金流分析（NPV/IRR/回收期）、退休提款规划（耗尽时间与可持续提款额）、储蓄目标规划（何时达成 / 每月需存多少）、通胀购买力换算（未来成本与实际收益率）。零运行时依赖、纯算术、确定性输出，全部结果由公开权威锚点验证（房贷表、教材 EAR、Excel IRR 官方示例）与独立闭式脚本生成，专门解决大模型心算金融公式易错的问题。

## License

MIT
