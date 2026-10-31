/**
 * Refinance comparison tests — every numeric expectation below is printed by
 * the independent oracle, which recomputes both loans with its own
 * amortisation and derives the horizon interest by month-by-month simulation
 * (the implementation derives it from the closed-form balance, so the two
 * sides agree only if the math is right).
 *
 * ORACLE: test/oracle/anchors.py — cases F1–F8 print every value asserted here.
 *
 * @module dsh-finance/test
 */

import { describe, expect, it } from 'vitest'
import { analyzeRefinance, MAX_REFINANCE_MONTHS, type RefinanceResult } from '../src/refinance.ts'
import { buildFinanceTools } from '../src/tools.ts'
import { assertLossless } from './helpers/lossless-json.ts'

function analyze(input: Parameters<typeof analyzeRefinance>[0]): RefinanceResult {
  const result = analyzeRefinance(input)
  if ('ok' in result) throw new Error(`unexpected invalid: ${result.reason}`)
  return result as RefinanceResult
}

function reasonOf(input: Parameters<typeof analyzeRefinance>[0]): string {
  const result = analyzeRefinance(input)
  if (!('ok' in result)) throw new Error('expected an invalid result')
  return result.reason
}

/** The plain case used by several tests: F1 — a 7.5% → 6% rate drop. */
const F1 = {
  balance: 200000,
  currentRatePercent: 7.5,
  remainingMonths: 300,
  newRatePercent: 6,
  closingCosts: 4000,
}

describe('refinance — the two views (F1)', () => {
  it('reports both loans and the payment saving', () => {
    const out = analyze(F1)
    expect(out.current.monthlyPayment).toBe(1477.98)
    expect(out.current.totalInterest).toBe(243394)
    expect(out.current.totalPaid).toBe(443394)
    expect(out.refinanced.monthlyPayment).toBe(1288.6)
    expect(out.refinanced.totalInterest).toBe(186580)
    expect(out.refinanced.totalPaid).toBe(386580)
    expect(out.refinanced.amountFinanced).toBe(200000)
    expect(out.monthlySavings).toBe(189.38)
  })

  it('says how long the closing costs take to be repaid', () => {
    const out = analyze(F1)
    expect(out.upfrontCash).toBe(4000)
    expect(out.breakEvenMonth).toBe(22)
    expect(out.breakEvenWithinHorizon).toBe(true)
    // minimality of the break-even month, from the definition
    expect(out.monthlySavings * 22).toBeGreaterThanOrEqual(out.upfrontCash)
    expect(out.monthlySavings * 21).toBeLessThan(out.upfrontCash)
  })

  it('reports the interest view over the horizon and over both terms', () => {
    const out = analyze(F1)
    expect(out.horizonMonths).toBe(300)
    expect(out.horizon.currentInterest).toBe(243396.07)
    expect(out.horizon.refinancedInterest).toBe(186581.94)
    expect(out.horizon.interestSaved).toBe(56814.13)
    expect(out.horizon.cashSaved).toBe(52814)
    expect(out.lifetimeInterestSaved).toBe(56814)
    expect(out.verdict).toBe('cheaper-every-way')
  })

  it('defaults the new term to the remaining term', () => {
    const out = analyze({ ...F1, newTermMonths: undefined })
    expect(out.newTermMonths).toBe(300)
    expect(out.horizonMonths).toBe(300)
  })
})

describe('refinance — closing costs financed (F2)', () => {
  it('adds the costs to the balance and leaves no cash at closing', () => {
    const out = analyze({ ...F1, rollCostsIn: true })
    expect(out.refinanced.amountFinanced).toBe(204000)
    expect(out.upfrontCash).toBe(0)
    expect(out.refinanced.monthlyPayment).toBe(1314.37)
    expect(out.monthlySavings).toBe(163.61)
    expect(out.lifetimeInterestSaved).toBe(53083)
    expect(out.horizon.interestSaved).toBe(53081.7)
    expect(out.verdict).toBe('cheaper-every-way')
  })

  it('breaks even in month one when nothing is paid up front', () => {
    const out = analyze({ ...F1, rollCostsIn: true })
    expect(out.breakEvenMonth).toBe(1)
    expect(out.breakEvenWithinHorizon).toBe(true)
    expect(out.note).toContain('closing costs are financed')
  })
})

describe('refinance — a worse rate is not better (F3)', () => {
  it('reports a rising payment, rising interest and no break-even', () => {
    const out = analyze({ ...F1, newRatePercent: 8, closingCosts: 3000 })
    expect(out.monthlySavings).toBe(-65.65)
    expect(out.refinanced.monthlyPayment).toBe(1543.63)
    expect(out.lifetimeInterestSaved).toBe(-19695)
    expect(out.horizon.interestSaved).toBe(-19695.25)
    expect(out.horizon.cashSaved).toBe(-22695)
    expect(out.verdict).toBe('not-better')
    expect(out.breakEvenMonth).toBeUndefined()
    expect(out.note).toContain('no break-even')
  })
})

describe('refinance — a shorter term trades payment for interest (F4)', () => {
  it('raises the payment, lowers the interest, and says so', () => {
    const out = analyze({
      balance: 150000,
      currentRatePercent: 6.5,
      remainingMonths: 300,
      newRatePercent: 5.25,
      newTermMonths: 180,
      closingCosts: 2500,
    })
    expect(out.current.monthlyPayment).toBe(1012.81)
    expect(out.refinanced.monthlyPayment).toBe(1205.82)
    expect(out.monthlySavings).toBe(-193.01)
    expect(out.lifetimeInterestSaved).toBe(86795.4)
    expect(out.horizonMonths).toBe(180)
    expect(out.horizon.currentInterest).toBe(121502.75)
    expect(out.horizon.refinancedInterest).toBe(67046.66)
    expect(out.horizon.interestSaved).toBe(54456.09)
    expect(out.horizon.cashSaved).toBe(-37241.8)
    expect(out.verdict).toBe('payment-up-interest-down')
    expect(out.breakEvenMonth).toBeUndefined()
    expect(out.note).toContain('new term is shorter')
  })
})

describe('refinance — no closing costs (F5)', () => {
  it('breaks even immediately when the rate simply drops', () => {
    const out = analyze({
      balance: 120000,
      currentRatePercent: 6,
      remainingMonths: 240,
      newRatePercent: 5,
    })
    expect(out.closingCosts).toBe(0)
    expect(out.upfrontCash).toBe(0)
    expect(out.monthlySavings).toBe(67.77)
    expect(out.refinanced.monthlyPayment).toBe(791.95)
    expect(out.horizon.interestSaved).toBe(16264.82)
    expect(out.horizon.cashSaved).toBe(16264.8)
    expect(out.breakEvenMonth).toBe(1)
    expect(out.verdict).toBe('cheaper-every-way')
  })
})

describe('refinance — the horizon changes the answer (F6)', () => {
  it('flags a break-even that falls after the horizon', () => {
    const out = analyze({ ...F1, horizonMonths: 12 })
    expect(out.horizonMonths).toBe(12)
    expect(out.horizon.currentInterest).toBe(14903.97)
    expect(out.horizon.refinancedInterest).toBe(11903.16)
    expect(out.horizon.interestSaved).toBe(3000.81)
    expect(out.horizon.cashSaved).toBe(-1727.44)
    expect(out.breakEvenMonth).toBe(22)
    expect(out.breakEvenWithinHorizon).toBe(false)
    expect(out.note).toContain('after the 12-month horizon')
  })
})

describe('refinance — zero-rate loans (F7)', () => {
  it('reports no saving at all and no break-even', () => {
    const out = analyze({
      balance: 2400,
      currentRatePercent: 0,
      remainingMonths: 24,
      newRatePercent: 0,
      closingCosts: 500,
    })
    expect(out.current.monthlyPayment).toBe(100)
    expect(out.refinanced.monthlyPayment).toBe(100)
    expect(out.monthlySavings).toBe(0)
    expect(out.current.totalInterest).toBe(0)
    expect(out.refinanced.totalInterest).toBe(0)
    expect(out.horizon.cashSaved).toBe(-500)
    expect(out.verdict).toBe('not-better')
    expect(out.breakEvenMonth).toBeUndefined()
  })
})

describe('refinance — stretching the term (F8)', () => {
  it('shows a lower payment and more interest at the same time', () => {
    const out = analyze({
      balance: 300000,
      currentRatePercent: 6,
      remainingMonths: 240,
      newRatePercent: 5,
      newTermMonths: 360,
      closingCosts: 2000,
    })
    expect(out.monthlySavings).toBe(538.83)
    expect(out.refinanced.monthlyPayment).toBe(1610.46)
    expect(out.lifetimeInterestSaved).toBe(-63936)
    expect(out.horizonMonths).toBe(240)
    expect(out.horizon.interestSaved).toBe(-22518.13)
    expect(out.horizon.cashSaved).toBe(127319.2)
    expect(out.breakEvenMonth).toBe(4)
    expect(out.verdict).toBe('payment-down-interest-up')
    expect(out.note).toContain('new term is longer')
  })
})

describe('refinance — validation', () => {
  it('rejects a non-positive balance', () => {
    expect(reasonOf({ ...F1, balance: 0 })).toBe('balance must be a positive number')
    expect(reasonOf({ ...F1, balance: Number.NaN })).toBe('balance must be a positive number')
  })

  it('rejects rates at or below -100%', () => {
    expect(reasonOf({ ...F1, currentRatePercent: -100 })).toBe('current_rate_percent must be greater than -100')
    expect(reasonOf({ ...F1, newRatePercent: -100 })).toBe('new_rate_percent must be greater than -100')
  })

  it('rejects terms outside 1..1200 months, including fractions', () => {
    expect(reasonOf({ ...F1, remainingMonths: 0 })).toBe(
      `remaining_months must be an integer between 1 and ${MAX_REFINANCE_MONTHS}`,
    )
    expect(reasonOf({ ...F1, remainingMonths: 12.5 })).toContain('remaining_months must be an integer')
    expect(reasonOf({ ...F1, newTermMonths: 0 })).toContain('new_term_months must be an integer')
    expect(reasonOf({ ...F1, newTermMonths: MAX_REFINANCE_MONTHS + 1 })).toContain('new_term_months must be an integer')
  })

  it('rejects negative closing costs', () => {
    expect(reasonOf({ ...F1, closingCosts: -1 })).toBe('closing_costs must be a non-negative number')
  })

  it('rejects a horizon outside 1..1200 months', () => {
    expect(reasonOf({ ...F1, horizonMonths: 0 })).toContain('horizon_months must be an integer')
    expect(reasonOf({ ...F1, horizonMonths: MAX_REFINANCE_MONTHS + 1 })).toContain('horizon_months must be an integer')
  })

  it('clamps the horizon to the shorter term rather than inventing months', () => {
    const out = analyze({ ...F1, horizonMonths: 600 })
    expect(out.horizonMonths).toBe(300)
  })

  it('never returns negative zero or undefined live keys', () => {
    for (const input of [
      F1,
      { ...F1, rollCostsIn: true },
      { ...F1, newRatePercent: 8 },
      { ...F1, horizonMonths: 12 },
      { balance: 2400, currentRatePercent: 0, remainingMonths: 24, newRatePercent: 0, closingCosts: 500 },
    ]) {
      assertLossless(analyze(input))
    }
  })
})

/** rc.x ToolDefinition.execute is typed (args, exec); tests call it single-arg (R14). */
type Exec1<TArgs, TOut> = (args: TArgs) => Promise<TOut>

const tools = buildFinanceTools()
const execRefinance = tools.refinance_analysis.execute as unknown as Exec1<
  {
    balance: number
    current_rate_percent: number
    remaining_months: number
    new_rate_percent: number
    new_term_months?: number
    closing_costs?: number
    roll_costs_in?: boolean
    horizon_months?: number
  },
  {
    valid: boolean
    balance?: number
    current?: { monthly_payment: number; remaining_interest: number; remaining_total: number }
    refinanced?: { monthly_payment: number; total_interest: number; total_paid: number; amount_financed: number }
    monthly_savings?: number
    upfront_cash?: number
    lifetime_interest_saved?: number
    horizon_months?: number
    horizon?: { current_interest: number; refinanced_interest: number; interest_saved: number; cash_saved: number }
    break_even_month?: number
    break_even_within_horizon?: boolean
    verdict?: string
    note?: string
    reason?: string
  }
>

function renderOf(tool: { output: { render: (args: Record<string, unknown>, value: unknown) => { text: string }[] } }, value: unknown): string {
  return tool.output.render({}, value)[0].text
}

describe('refinance_analysis tool', () => {
  it('exposes the comparison with snake_case fields', async () => {
    const out = await execRefinance({
      balance: 200000,
      current_rate_percent: 7.5,
      remaining_months: 300,
      new_rate_percent: 6,
      closing_costs: 4000,
    })
    expect(out.valid).toBe(true)
    expect(out.balance).toBe(200000)
    expect(out.current?.monthly_payment).toBe(1477.98)
    expect(out.current?.remaining_interest).toBe(243394)
    expect(out.refinanced?.monthly_payment).toBe(1288.6)
    expect(out.refinanced?.total_interest).toBe(186580)
    expect(out.refinanced?.amount_financed).toBe(200000)
    expect(out.monthly_savings).toBe(189.38)
    expect(out.horizon?.interest_saved).toBe(56814.13)
    expect(out.break_even_month).toBe(22)
    expect(out.verdict).toBe('cheaper-every-way')
    assertLossless(out)
  })

  it('renders both views and the break-even in words', async () => {
    const out = await execRefinance({
      balance: 200000,
      current_rate_percent: 7.5,
      remaining_months: 300,
      new_rate_percent: 6,
      closing_costs: 4000,
    })
    const text = renderOf(tools.refinance_analysis as never, out)
    expect(text).toContain('refinance 200000 at 7.5% (300 months left)')
    expect(text).toContain('payment 1477.98 → 1288.6')
    expect(text).toContain('saves 189.38/month')
    expect(text).toContain('cheaper on both counts')
    expect(text).toContain('break-even at month 22')
    expect(text).toContain('inside the 300-month horizon')
  })

  it('renders the stretched-term verdict without calling it a saving', async () => {
    const out = await execRefinance({
      balance: 300000,
      current_rate_percent: 6,
      remaining_months: 240,
      new_rate_percent: 5,
      new_term_months: 360,
      closing_costs: 2000,
    })
    const text = renderOf(tools.refinance_analysis as never, out)
    expect(text).toContain('lower payment but more interest')
    expect(text).toContain('adds 63936 over the two terms')
    expect(text).toContain('new term is longer')
  })

  it('renders the invalid path', async () => {
    const out = await execRefinance({
      balance: -1,
      current_rate_percent: 7.5,
      remaining_months: 300,
      new_rate_percent: 6,
    })
    expect(out.valid).toBe(false)
    expect(out.reason).toBe('balance must be a positive number')
    expect(renderOf(tools.refinance_analysis as never, out)).toContain('cannot analyse the refinance:')
  })

  it('registers nine tools and keeps the older ones working', async () => {
    expect(Object.keys(tools).sort()).toEqual([
      'cashflow_analysis',
      'compound_growth',
      'debt_payoff',
      'inflation_adjust',
      'loan_payment',
      'rate_convert',
      'refinance_analysis',
      'retirement_plan',
      'savings_goal',
    ])
    const loan = await tools.loan_payment.execute({ principal: 300000, annual_rate_percent: 4, months: 360 })
    expect((loan as { monthly_payment: number }).monthly_payment).toBe(1432.25)
  })
})
