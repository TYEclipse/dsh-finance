# dsh-finance

> Money math toolbox for [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) — loan payments with amortization, compound growth projection, and nominal/effective rate conversion. Zero runtime dependencies, pure arithmetic, fully deterministic.

Agents are bad at money math. "What's the monthly payment on a $300k mortgage at 4% for 30 years?" and "how much will $1,000 grow to in 10 years at 5% compounded monthly?" are exactly the questions LLMs miscalculate — compound interest and PMT formulas are easy to misremember, and a wrong answer here is a wrong financial decision. This plugin turns those questions into deterministic tool calls.

## Tools

| Tool | Description |
|------|-------------|
| `loan_payment` | Fixed-rate loan payment (PMT) → monthly payment, total paid, total interest. Optional amortization schedule (capped at 360 rows) and/or a constant extra principal payment per month (shortened term, interest saved). |
| `compound_growth` | Future value of a lump sum with optional monthly contributions (ordinary annuity). Supports daily / monthly / quarterly / semiannually / annually / continuous compounding. Optional year-by-year breakdown (capped at 60 rows). |
| `rate_convert` | Nominal (APR) ↔ effective (EAR) annual rate conversion, incl. continuous compounding (EAR = e^r − 1). |

## Why

- **LLMs get these wrong** — compound interest, PMT and EAR conversions are classic hallucination territory; this plugin provides exact, tested answers.
- **Zero runtime dependencies** — pure `Math` arithmetic, no network, no filesystem, no dynamic evaluation. Safe to run anywhere.
- **External-anchor tested** — headline numbers are verified against published mortgage tables and textbook EAR values (e.g. $300k @ 4% / 30y → $1,432.25; 12% nominal monthly → 12.682503% EAR), never self-roundtrips.

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
```

## Semantics

- **Money rounding**: amounts are rounded to cents at the output boundary only; internal amortization iterations carry full precision, and the final payment is adjusted to clear the balance exactly.
- **Extra payments**: the contract payment stays fixed; the term shrinks. The tool reports `payoff_months`, `months_saved` and `interest_saved`.
- **Compounding**: `loan_payment` uses monthly compounding of the APR by convention (mortgage standard). `compound_growth` converts any frequency to an effective monthly rate first, so contributions compose exactly. `continuous` uses e^rt.
- **Zero interest** is handled exactly (no division by zero): payment = principal ÷ months; growth = principal + contributions.
- **Validation**: every tool validates its inputs and returns `valid: false` with a precise reason instead of throwing.

## Limits (by design)

- No fees, taxes, insurance or escrow — pure amortization math.
- Schedule capped at 360 rows, yearly breakdown at 60 rows (see `truncated`).
- No currency conversion — all amounts are in one currency unit.
- Rates below −100% are rejected as nonsensical; anything above is computed exactly.

## License

MIT

---

## 中文简介

dsh-finance 是 DeepSeek Harness 的**金融数学工具箱**：贷款月供计算（含等额本息摊销表、提前还款影响）、复利增长测算（含定投、支持日/月/季/半年/年/连续复利）、名义利率与有效年利率互转。零运行时依赖、纯算术、完全确定性——专治 LLM 在复利与贷款月供上的心算错误。锚点用例全部对照公开贷款表与教材值验证（30 万美元 4% 利率 30 年期月供 $1,432.25；12% 名义月复利 = 12.682503% 有效年利率）。
