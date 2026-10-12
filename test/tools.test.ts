/**
 * Tool-level tests for dsh-finance — exercises each defineTool surface through
 * the built ToolSet: valid paths, invalid input paths, optional output fields
 * and lossless-JSON shape stability (no undefined values).
 *
 * ORACLE: test/oracle/anchors.py — the numeric expectations added for
 * `savings_goal` (B5), `inflation_adjust` (I2, I1) and `debt_payoff` (D1) come
 * from that script.
 *
 * @module dsh-finance/test
 */

import { describe, expect, it } from 'vitest'
import { buildFinanceTools } from '../src/tools.ts'
import { assertLossless } from './helpers/lossless-json.ts'

const tools = buildFinanceTools()

/** rc.x ToolDefinition.execute is typed (args, exec); tests call it single-arg (R14). */
type Exec1<TArgs, TOut> = (args: TArgs) => Promise<TOut>

const execCashflow = tools.cashflow_analysis.execute as unknown as Exec1<
  { cash_flows: number[]; discount_rate_percent?: number },
  {
    valid: boolean
    periods?: number
    total_inflow?: number
    total_outflow?: number
    net_cashflow?: number
    npv?: number
    irr_percent?: number
    multiple_irr_possible?: boolean
    irr_note?: string
    payback_periods?: number
    discounted_payback_periods?: number
    reason?: string
  }
>

const execRetirement = tools.retirement_plan.execute as unknown as Exec1<
  { principal: number; annual_rate_percent: number; monthly_withdrawal?: number; years?: number },
  {
    valid: boolean
    principal?: number
    annual_rate_percent?: number
    monthly_withdrawal?: number
    withdrawal_rate_percent?: number
    months_to_exhaust?: number
    years_to_exhaust?: number
    never_exhausts?: boolean
    sustainable_monthly_withdrawal?: number
    horizon_months?: number
    horizon_years?: number
    total_withdrawn?: number
    interest_earned?: number
    lasts_horizon?: boolean
    reason?: string
  }
>

const execDebt = tools.debt_payoff.execute as unknown as Exec1<
  {
    debts: Array<{ name?: string; balance: number; annual_rate_percent: number; minimum_payment: number }>
    monthly_budget: number
    strategy?: string
  },
  {
    valid: boolean
    reason?: string
    debt_count?: number
    extra_per_month?: number
    debt_free?: boolean
    months_to_debt_free?: number
    total_interest?: number
    best_strategy?: string
    interest_saved_by_best?: number
    payoff_order?: Array<{ name: string; cleared_month: number; interest_paid: number; paid: number }>
  }
>

/** Recursively assert a JSON value carries no undefined, -0 or non-finite number. */

describe('loan_payment tool', () => {
  it('computes the classic 300k @ 4% / 30y loan', async () => {
    const out = await tools.loan_payment.execute({ principal: 300000, annual_rate_percent: 4, months: 360 })
    expect(out.valid).toBe(true)
    expect(out.monthly_payment).toBeCloseTo(1432.25, 2)
    expect(out.total_interest).toBeCloseTo(215610, 0)
    expect(out.payoff_months).toBe(360)
    expect('months_saved' in out).toBe(false)
    assertLossless(out)
  })

  it('reports extra-payment impact', async () => {
    const out = await tools.loan_payment.execute({ principal: 300000, annual_rate_percent: 4, months: 360, extra_principal_per_month: 100 })
    expect(out.valid).toBe(true)
    expect(out.months_saved).toBeGreaterThan(0)
    expect(out.interest_saved).toBeGreaterThan(0)
    expect(out.payoff_months).toBe(360 - (out.months_saved ?? 0))
    assertLossless(out)
  })

  it('returns a capped schedule on request', async () => {
    const out = await tools.loan_payment.execute({ principal: 100000, annual_rate_percent: 5, months: 600, include_schedule: true })
    expect(out.valid).toBe(true)
    expect(Array.isArray(out.schedule)).toBe(true)
    expect(out.schedule?.length).toBe(360)
    expect(out.truncated).toBe(true)
    assertLossless(out)
  })

  it('reports invalid input without throwing', async () => {
    const out = await tools.loan_payment.execute({ principal: -1, annual_rate_percent: 4, months: 12 })
    expect(out.valid).toBe(false)
    expect(typeof out.reason).toBe('string')
    expect((out.reason as string).length).toBeGreaterThan(0)
    assertLossless(out)
  })
})

describe('compound_growth tool', () => {
  it('projects a textbook monthly-compounding case', async () => {
    const out = await tools.compound_growth.execute({ principal: 1000, annual_rate_percent: 5, years: 10, compounding: 'monthly' })
    expect(out.valid).toBe(true)
    expect(out.future_value).toBeCloseTo(1647.01, 2)
    expect(out.interest_earned).toBeCloseTo(647.01, 2)
    expect(out.months).toBe(120)
    expect('breakdown' in out).toBe(false)
    assertLossless(out)
  })

  it('accepts every compounding frequency', async () => {
    for (const compounding of ['daily', 'monthly', 'quarterly', 'semiannually', 'annually', 'continuous'] as const) {
      const out = await tools.compound_growth.execute({ principal: 1000, annual_rate_percent: 10, years: 1, compounding })
      expect(out.valid, compounding).toBe(true)
      expect(out.future_value).toBeGreaterThan(1000)
    }
  })

  it('includes a yearly breakdown on request', async () => {
    const out = await tools.compound_growth.execute({ principal: 1000, annual_rate_percent: 5, years: 3, compounding: 'monthly', contribution_per_month: 100, include_breakdown: true })
    expect(out.valid).toBe(true)
    expect(out.breakdown?.length).toBe(3)
    assertLossless(out)
  })

  it('rejects invalid compounding at the schema gate', async () => {
    await expect(
      tools.compound_growth.execute({ principal: 1000, annual_rate_percent: 5, years: 10, compounding: 'weekly' as never }),
    ).rejects.toThrow(/compounding/)
    const negative = await tools.compound_growth.execute({ principal: 0, annual_rate_percent: 5, years: 10, compounding: 'monthly' })
    expect(negative.valid).toBe(false)
    assertLossless(negative)
  })
})

describe('rate_convert tool', () => {
  it('converts nominal → EAR (textbook 12.682503%)', async () => {
    const out = await tools.rate_convert.execute({ rate_percent: 12, input_kind: 'nominal', compounding: 'monthly' })
    expect(out.valid).toBe(true)
    expect(out.output_kind).toBe('effective (EAR)')
    expect(out.output_rate_percent).toBeCloseTo(12.682503, 5)
    assertLossless(out)
  })

  it('converts EAR → nominal (round-trip)', async () => {
    const out = await tools.rate_convert.execute({ rate_percent: 12.682503, input_kind: 'effective', compounding: 'monthly' })
    expect(out.valid).toBe(true)
    expect(out.output_kind).toBe('nominal (APR)')
    expect(out.output_rate_percent).toBeCloseTo(12, 3)
  })

  it('handles continuous compounding both ways', async () => {
    const ear = await tools.rate_convert.execute({ rate_percent: 10, input_kind: 'nominal', compounding: 'continuous' })
    expect(ear.output_rate_percent).toBeCloseTo(10.517092, 5)
    const nom = await tools.rate_convert.execute({ rate_percent: 10.517092, input_kind: 'effective', compounding: 'continuous' })
    expect(nom.output_rate_percent).toBeCloseTo(10, 4)
  })

  it('rejects invalid kinds and compounding values at the schema gate', async () => {
    await expect(
      tools.rate_convert.execute({ rate_percent: 12, input_kind: 'apr' as never, compounding: 'monthly' }),
    ).rejects.toThrow(/input_kind/)
    await expect(
      tools.rate_convert.execute({ rate_percent: 12, input_kind: 'nominal', compounding: 'weekly' as never }),
    ).rejects.toThrow(/compounding/)
    const rate = await tools.rate_convert.execute({ rate_percent: -101, input_kind: 'nominal', compounding: 'monthly' })
    expect(rate.valid).toBe(false)
  })
})

describe('cashflow_analysis tool', () => {
  it('computes the Excel IRR documentation example', async () => {
    const out = await execCashflow({ cash_flows: [-70000, 12000, 15000, 18000, 21000, 26000], discount_rate_percent: 8 })
    expect(out.valid).toBe(true)
    expect(out.irr_percent).toBeCloseTo(8.663095, 6)
    expect(out.npv).toBeCloseTo(1390.96, 2)
    expect(out.periods).toBe(5)
    expect(out.payback_periods).toBeGreaterThan(3)
    assertLossless(out)
  })

  it('flags multiple sign changes instead of fabricating an IRR', async () => {
    const out = await execCashflow({ cash_flows: [-100, 230, -132], discount_rate_percent: 8 })
    expect(out.valid).toBe(true)
    expect(out.multiple_irr_possible).toBe(true)
    expect('irr_percent' in out).toBe(false)
    expect(typeof out.irr_note).toBe('string')
    assertLossless(out)
  })

  it('reports invalid inputs without throwing', async () => {
    const out = await execCashflow({ cash_flows: [100] })
    expect(out.valid).toBe(false)
    expect(typeof out.reason).toBe('string')
    assertLossless(out)
  })
})

describe('retirement_plan tool', () => {
  it('computes the sustainable withdrawal for a horizon', async () => {
    const out = await execRetirement({ principal: 1000000, annual_rate_percent: 4, years: 30 })
    expect(out.valid).toBe(true)
    expect(out.sustainable_monthly_withdrawal).toBeCloseTo(4774.15, 2)
    expect(out.total_withdrawn).toBeCloseTo(1718694, 0)
    expect('months_to_exhaust' in out).toBe(false)
    assertLossless(out)
  })

  it('computes time to exhaustion for a withdrawal', async () => {
    const out = await execRetirement({ principal: 1000000, annual_rate_percent: 4, monthly_withdrawal: 4000 })
    expect(out.valid).toBe(true)
    expect(out.months_to_exhaust).toBeCloseTo(538.42, 2)
    expect(out.withdrawal_rate_percent).toBeCloseTo(4.8, 6)
    assertLossless(out)
  })

  it('combines withdrawal and horizon into lasts_horizon', async () => {
    const out = await execRetirement({ principal: 1000000, annual_rate_percent: 4, monthly_withdrawal: 5000, years: 30 })
    expect(out.valid).toBe(true)
    expect(out.lasts_horizon).toBe(false)
    assertLossless(out)
  })

  it('reports invalid inputs without throwing', async () => {
    const out = await execRetirement({ principal: 1000000, annual_rate_percent: 4 })
    expect(out.valid).toBe(false)
    expect(typeof out.reason).toBe('string')
    assertLossless(out)
  })
})

const execGoal = tools.savings_goal.execute as unknown as Exec1<
  { target_amount: number; annual_rate_percent: number; current_savings?: number; monthly_contribution?: number; months?: number },
  {
    valid: boolean
    target_amount?: number
    current_savings?: number
    annual_rate_percent?: number
    monthly_contribution?: number
    months_to_goal?: number
    final_balance?: number
    total_contributions?: number
    interest_earned?: number
    already_reached?: boolean
    unreachable?: boolean
    required_monthly_contribution?: number
    horizon_months?: number
    projected_balance?: number
    projected_interest?: number
    on_track?: boolean
    reason?: string
  }
>

const execInflation = tools.inflation_adjust.execute as unknown as Exec1<
  { amount: number; annual_inflation_percent: number; years: number; nominal_rate_percent?: number },
  {
    valid: boolean
    amount?: number
    annual_inflation_percent?: number
    years?: number
    months?: number
    future_cost?: number
    real_value?: number
    nominal_rate_percent?: number
    real_rate_percent?: number
    nominal_future_value?: number
    real_future_value?: number
    reason?: string
  }
>

/** Render helper: the tool's own render output as plain text. */
function renderOf(tool: { output: { render: (args: Record<string, unknown>, value: unknown) => { text: string }[] } }, value: unknown): string {
  return tool.output.render({}, value)[0].text
}

describe('savings_goal tool', () => {
  it('answers both questions at once and renders them', async () => {
    const out = await execGoal({
      target_amount: 50000,
      annual_rate_percent: 5,
      current_savings: 10000,
      monthly_contribution: 500,
      months: 66,
    })
    expect(out.valid).toBe(true)
    expect(out.months_to_goal).toBe(65)
    expect(out.final_balance).toBeCloseTo(50341.48, 2)
    expect(out.total_contributions).toBeCloseTo(42500, 2)
    expect(out.interest_earned).toBeCloseTo(7841.48, 2)
    expect(out.required_monthly_contribution).toBeCloseTo(486.13, 2)
    expect(out.projected_balance).toBeCloseTo(50000.07, 2)
    expect(out.projected_interest).toBeCloseTo(7915.49, 2)
    expect(out.on_track).toBe(true)
    assertLossless(out)
    const text = renderOf(tools.savings_goal as never, out)
    expect(text).toContain('target $50000')
    expect(text).toContain('reached in 65 months')
    expect(text).toContain('needs $486.13/month for 66 months')
    expect(text).toContain('on track: yes')
  })

  it('renders the already-reached and unreachable branches', async () => {
    const reached = await execGoal({ target_amount: 5000, annual_rate_percent: 3, current_savings: 6000, monthly_contribution: 100 })
    expect(reached.already_reached).toBe(true)
    expect(renderOf(tools.savings_goal as never, reached)).toContain('target already reached')

    const stuck = await execGoal({ target_amount: 100000, annual_rate_percent: 0, current_savings: 1000, monthly_contribution: 0 })
    expect(stuck.unreachable).toBe(true)
    expect(renderOf(tools.savings_goal as never, stuck)).toContain('not reached within 100 years')
    assertLossless(stuck)
  })

  it('returns a reason instead of throwing when no mode is given', async () => {
    const out = await execGoal({ target_amount: 1000, annual_rate_percent: 5 })
    expect(out.valid).toBe(false)
    expect(out.reason).toBe('provide monthly_contribution and/or months (at least one is required)')
    expect(renderOf(tools.savings_goal as never, out)).toContain('cannot plan the savings goal:')
    assertLossless(out)
  })
})

describe('inflation_adjust tool', () => {
  it('computes cost, present value and the real return', async () => {
    const out = await execInflation({ amount: 1000, annual_inflation_percent: 2.5, years: 10, nominal_rate_percent: 6 })
    expect(out.valid).toBe(true)
    expect(out.months).toBe(120)
    expect(out.future_cost).toBeCloseTo(1280.08, 2)
    expect(out.real_value).toBeCloseTo(781.2, 2)
    expect(out.real_rate_percent).toBeCloseTo(3.414634, 6)
    expect(out.nominal_future_value).toBeCloseTo(1790.85, 2)
    expect(out.real_future_value).toBeCloseTo(1399.01, 2)
    assertLossless(out)
    const text = renderOf(tools.inflation_adjust as never, out)
    expect(text).toContain('future cost $1280.08')
    expect(text).toContain('real 3.414634%/yr')
  })

  it('omits the return fields when no nominal rate is given', async () => {
    const out = await execInflation({ amount: 1000, annual_inflation_percent: 2.5, years: 10 })
    expect(out.valid).toBe(true)
    expect('nominal_rate_percent' in out).toBe(false)
    expect('real_rate_percent' in out).toBe(false)
    assertLossless(out)
    const text = renderOf(tools.inflation_adjust as never, out)
    expect(text).toContain('future cost $1280.08')
    expect(text).not.toContain('nominal')
  })

  it('returns a reason instead of throwing on bad input', async () => {
    const out = await execInflation({ amount: 1000, annual_inflation_percent: 2.5, years: 0 })
    expect(out.valid).toBe(false)
    expect(out.reason).toBe('years must be between 1/12 and 200')
    expect(renderOf(tools.inflation_adjust as never, out)).toContain('cannot adjust for inflation:')
    assertLossless(out)
  })
})

describe('debt_payoff tool', () => {
  it('plans two cards against one budget and renders the winner (D1)', async () => {
    const out = await execDebt({
      debts: [
        { name: 'card A', balance: 5000, annual_rate_percent: 22, minimum_payment: 100 },
        { name: 'card B', balance: 2000, annual_rate_percent: 12, minimum_payment: 50 },
      ],
      monthly_budget: 600,
    })
    expect(out.valid).toBe(true)
    expect(out.debt_count).toBe(2)
    expect(out.extra_per_month).toBe(450)
    expect(out.debt_free).toBe(true)
    expect(out.months_to_debt_free).toBe(13)
    expect(out.total_interest).toBeCloseTo(739.37, 2)
    expect(out.best_strategy).toBe('avalanche')
    expect(out.interest_saved_by_best).toBeCloseTo(156.33, 2)
    expect(out.payoff_order?.map((row) => row.name)).toEqual(['card A', 'card B'])
    assertLossless(out)
    const text = renderOf(tools.debt_payoff as never, out)
    expect(text).toContain('debt-free in 13 months')
    expect(text).toContain('interest $739.37')
    expect(text).toContain('avalanche costs $156.33 less interest')
  })

  it('renders the honest never-clears branch and the tie branch', async () => {
    const stuck = await execDebt({
      debts: [{ name: 'store card', balance: 1000, annual_rate_percent: 24, minimum_payment: 10 }],
      monthly_budget: 10,
    })
    expect(stuck.valid).toBe(true)
    expect(stuck.debt_free).toBe(false)
    expect(renderOf(tools.debt_payoff as never, stuck)).toContain('never clears')

    const tie = await execDebt({
      debts: [{ name: 'loan', balance: 1200, annual_rate_percent: 0, minimum_payment: 100 }],
      monthly_budget: 300,
    })
    expect(tie.months_to_debt_free).toBe(4)
    expect(renderOf(tools.debt_payoff as never, tie)).toContain('both strategies cost the same interest')
    assertLossless(tie)
  })

  it('returns a reason instead of throwing on bad input', async () => {
    const out = await execDebt({ debts: [], monthly_budget: 100 })
    expect(out.valid).toBe(false)
    expect(typeof out.reason).toBe('string')
    expect(renderOf(tools.debt_payoff as never, out)).toContain('cannot plan the payoff:')
    assertLossless(out)
  })
})
