/**
 * Extra-payment scenario tests — every numeric expectation below is printed by
 * the independent oracle. The oracle derives interest as (everything paid −
 * principal) and computes both investment sides from closed-form annuities,
 * while the implementation accumulates month by month and sums per-month
 * interest — so the two agree only if the math is right.
 *
 * ORACLE: test/oracle/anchors.py — cases X1–X10 print every value asserted here.
 *
 * @module dsh-finance/test
 */

import { describe, expect, it } from 'vitest'
import { computeExtraScenario, MAX_EXTRA_MONTHS, type ExtraScenarioResult } from '../src/extra.ts'
import { buildFinanceTools } from '../src/tools.ts'
import { assertLossless } from './helpers/lossless-json.ts'

function scenario(input: Parameters<typeof computeExtraScenario>[0]): ExtraScenarioResult {
  const result = computeExtraScenario(input)
  if ('ok' in result) throw new Error(`unexpected invalid: ${result.reason}`)
  return result as ExtraScenarioResult
}

function reasonOf(input: Parameters<typeof computeExtraScenario>[0]): string {
  const result = computeExtraScenario(input)
  if (!('ok' in result)) throw new Error('expected an invalid result')
  return result.reason
}

/** X1 — the plain question: $200/month against a 6% loan with 300 months left. */
const X1 = { balance: 200000, annualRatePercent: 6, remainingMonths: 300, extraPayment: 200 }

describe('extra payment — months and interest saved (X1)', () => {
  it('keeps the contract payment and shortens the loan', () => {
    const out = scenario(X1)
    expect(out.monthlyPayment).toBe(1288.6)
    expect(out.baseline.months).toBe(300)
    expect(out.baseline.totalInterest).toBe(186581.94)
    expect(out.baseline.totalPaid).toBe(386581.94)
    expect(out.withExtra.months).toBe(224)
    expect(out.monthsSaved).toBe(76)
  })

  it('reports the interest saved and what the extra actually paid', () => {
    const out = scenario(X1)
    expect(out.withExtra.totalInterest).toBe(132503.49)
    expect(out.withExtra.totalPaid).toBe(332503.49)
    expect(out.withExtra.extraPaid).toBe(44600)
    expect(out.interestSaved).toBe(54078.45)
  })

  it('names the guaranteed return of prepaying — it is the loan rate', () => {
    expect(scenario(X1).guaranteedReturnPercent).toBe(6)
  })

  it('omits the invest comparison entirely when no rate is supplied', () => {
    const out = scenario(X1)
    expect(out.investing).toBeUndefined()
    expect(out.verdict).toBeUndefined()
    expect(out.note).toContain('No invest_rate_percent was given')
  })
})

describe('extra payment — prepay versus invest on the same budget (X2–X4)', () => {
  it('at the loan rate the two sides are the same trade (X2)', () => {
    const out = scenario({ ...X1, investRatePercent: 6 })
    expect(out.investing?.ratePercent).toBe(6)
    expect(out.investing?.horizonMonths).toBe(300)
    expect(out.investing?.contributions).toBe(60000)
    expect(out.investing?.value).toBe(138596.85)
    expect(out.investing?.prepayValue).toBe(138596.85)
    expect(out.investing?.difference).toBe(0)
    expect(out.verdict).toBe('tie')
    expect(out.note).toContain('Same rate on both sides')
  })

  it('a better return tips it to investing, and says by how much (X3)', () => {
    const out = scenario({ ...X1, investRatePercent: 8 })
    expect(out.investing?.value).toBe(190203.34)
    expect(out.investing?.prepayValue).toBe(148255.2)
    expect(out.investing?.difference).toBe(-41948.14)
    expect(out.verdict).toBe('invest_wins')
  })

  it('a worse return tips it to prepaying (X4)', () => {
    const out = scenario({ ...X1, investRatePercent: 4 })
    expect(out.investing?.value).toBe(102823.97)
    expect(out.investing?.prepayValue).toBe(129726.58)
    expect(out.investing?.difference).toBe(26902.61)
    expect(out.verdict).toBe('prepay_wins')
  })

  it('states what the comparison does not model', () => {
    expect(scenario({ ...X1, investRatePercent: 8 }).note).toContain('no taxes, fees or risk premium')
  })
})

describe('extra payment — small loans and edge cases (X6–X10)', () => {
  it('handles a small high-rate loan (X6)', () => {
    const out = scenario({ balance: 1000, annualRatePercent: 12, remainingMonths: 24, extraPayment: 50, investRatePercent: 12 })
    expect(out.monthlyPayment).toBe(47.07)
    expect(out.baseline.totalInterest).toBe(129.77)
    expect(out.withExtra.months).toBe(11)
    expect(out.withExtra.extraPaid).toBe(542.88)
    expect(out.monthsSaved).toBe(13)
    expect(out.interestSaved).toBe(69.13)
    expect(out.investing?.value).toBe(1348.58)
    expect(out.investing?.prepayValue).toBe(1348.58)
    expect(out.verdict).toBe('tie')
  })

  it('keeps a zero-rate loan exact — no interest either way (X7)', () => {
    const out = scenario({ balance: 5000, annualRatePercent: 0, remainingMonths: 12, extraPayment: 100, investRatePercent: 0 })
    expect(out.monthlyPayment).toBe(416.67)
    expect(out.baseline.totalInterest).toBe(0)
    expect(out.baseline.totalPaid).toBe(5000)
    expect(out.withExtra.months).toBe(10)
    expect(out.withExtra.extraPaid).toBe(900)
    expect(out.monthsSaved).toBe(2)
    expect(out.interestSaved).toBe(0)
    expect(out.investing?.value).toBe(1200.04)
    expect(out.investing?.difference).toBe(0)
  })

  it('models a mid-size loan without a comparison (X8)', () => {
    const out = scenario({ balance: 15000, annualRatePercent: 7.25, remainingMonths: 48, extraPayment: 150 })
    expect(out.monthlyPayment).toBe(360.94)
    expect(out.baseline.totalInterest).toBe(2324.9)
    expect(out.withExtra.months).toBe(33)
    expect(out.withExtra.extraPaid).toBe(4800)
    expect(out.interestSaved).toBe(762.72)
  })

  it('an extra that never pays the loan off early still saves interest (X9)', () => {
    const out = scenario({ balance: 100000, annualRatePercent: 4.5, remainingMonths: 120, extraPayment: 1, investRatePercent: 4.5 })
    expect(out.monthsSaved).toBe(0)
    expect(out.interestSaved).toBe(31.2)
    expect(out.withExtra.months).toBe(120)
    expect(out.verdict).toBe('tie')
  })

  it('clears the loan in one month when the extra covers it (X10)', () => {
    const out = scenario({ balance: 1000, annualRatePercent: 6, remainingMonths: 12, extraPayment: 1000, investRatePercent: 5 })
    expect(out.withExtra.months).toBe(1)
    expect(out.withExtra.totalInterest).toBe(5)
    expect(out.withExtra.extraPaid).toBe(918.93)
    expect(out.monthsSaved).toBe(11)
    expect(out.verdict).toBe('prepay_wins')
  })
})

describe('extra payment — validation', () => {
  it('rejects a non-positive balance', () => {
    expect(reasonOf({ ...X1, balance: 0 })).toBe('balance must be a positive number')
  })

  it('rejects a rate at or below -100%', () => {
    expect(reasonOf({ ...X1, annualRatePercent: -100 })).toBe('annual_rate_percent must be greater than -100')
  })

  it('rejects a term outside 1..MAX_EXTRA_MONTHS', () => {
    expect(reasonOf({ ...X1, remainingMonths: 0 })).toContain('remaining_months must be an integer between 1 and')
    expect(reasonOf({ ...X1, remainingMonths: MAX_EXTRA_MONTHS + 1 })).toContain('remaining_months must be')
    expect(reasonOf({ ...X1, remainingMonths: 12.5 })).toContain('remaining_months must be')
  })

  it('rejects a zero extra payment and points at the plain loan tool', () => {
    expect(reasonOf({ ...X1, extraPayment: 0 }))
      .toBe('extra_payment must be a positive number (use loan_payment for a plain schedule)')
  })

  it('rejects an impossible investment rate', () => {
    expect(reasonOf({ ...X1, investRatePercent: -100 })).toBe('invest_rate_percent must be greater than -100')
  })
})

describe('extra_payment_scenario — tool surface', () => {
  const tools = buildFinanceTools()
  type Exec1<TArgs, TOut> = (args: TArgs) => Promise<TOut>

  type Out = {
    valid: boolean
    monthly_payment?: number
    months_saved?: number
    interest_saved?: number
    guaranteed_return_percent?: number
    baseline?: { months: number; total_interest: number; total_paid: number }
    with_extra?: { months: number; total_interest: number; total_paid: number; extra_paid: number }
    investing?: { value: number; prepay_value: number; difference: number; contributions: number; horizon_months: number; rate_percent: number }
    verdict?: string
    note?: string
    reason?: string
  }

  const exec = tools.extra_payment_scenario.execute as unknown as Exec1<
    {
      balance: number
      annual_rate_percent: number
      remaining_months: number
      extra_payment: number
      invest_rate_percent?: number
    },
    Out
  >

  it('is registered alongside the other nine tools', () => {
    expect(Object.keys(tools).sort()).toEqual([
      'cashflow_analysis',
      'compound_growth',
      'debt_payoff',
      'extra_payment_scenario',
      'inflation_adjust',
      'loan_payment',
      'rate_convert',
      'refinance_analysis',
      'retirement_plan',
      'savings_goal',
    ])
  })

  it('returns the full picture and no undefined/live keys', async () => {
    const out = await exec({ balance: 200000, annual_rate_percent: 6, remaining_months: 300, extra_payment: 200 })
    expect(out.valid).toBe(true)
    expect(out.monthly_payment).toBe(1288.6)
    expect(out.months_saved).toBe(76)
    expect(out.interest_saved).toBe(54078.45)
    expect(out.guaranteed_return_percent).toBe(6)
    expect(out.baseline?.months).toBe(300)
    expect(out.with_extra?.extra_paid).toBe(44600)
    expect('investing' in out).toBe(false)
    expect('verdict' in out).toBe(false)
    assertLossless(out)
  })

  it('adds the investing block only when a rate is given', async () => {
    const out = await exec({
      balance: 200000,
      annual_rate_percent: 6,
      remaining_months: 300,
      extra_payment: 200,
      invest_rate_percent: 8,
    })
    expect(out.investing?.rate_percent).toBe(8)
    expect(out.investing?.value).toBe(190203.34)
    expect(out.investing?.prepay_value).toBe(148255.2)
    expect(out.investing?.difference).toBe(-41948.14)
    expect(out.verdict).toBe('invest_wins')
    assertLossless(out)
  })

  it('surfaces validation failures as valid:false with a reason', async () => {
    const out = await exec({ balance: 1000, annual_rate_percent: 6, remaining_months: 12, extra_payment: 0 })
    expect(out.valid).toBe(false)
    expect(out.reason).toBe('extra_payment must be a positive number (use loan_payment for a plain schedule)')
    assertLossless(out)
  })

  it('renders a human-readable line for both shapes', async () => {
    const plain = await exec({ balance: 200000, annual_rate_percent: 6, remaining_months: 300, extra_payment: 200 })
    const plainText = tools.extra_payment_scenario.output.render({}, plain)[0]
    expect(plainText.text).toContain('adding $200/month clears it in 224 months instead of 300')
    expect(plainText.text).toContain('saves 54078.45')

    const compared = await exec({
      balance: 200000,
      annual_rate_percent: 6,
      remaining_months: 300,
      extra_payment: 200,
      invest_rate_percent: 8,
    })
    const comparedText = tools.extra_payment_scenario.output.render({}, compared)[0]
    expect(comparedText.text).toContain('investing the same money at 8% instead would end at 190203.34')
    expect(comparedText.text).toContain('invest_wins')
  })

  it('renders a failure line instead of throwing', () => {
    const text = tools.extra_payment_scenario.output.render({}, { valid: false, reason: 'balance must be a positive number' })[0]
    expect(text.text).toBe('cannot model the extra payment: balance must be a positive number')
  })
})
