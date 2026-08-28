/**
 * Tool-level tests for dsh-finance — exercises each defineTool surface through
 * the built ToolSet: valid paths, invalid input paths, optional output fields
 * and lossless-JSON shape stability (no undefined values).
 *
 * @module dsh-finance/test
 */

import { describe, expect, it } from 'vitest'
import { buildFinanceTools } from '../src/tools.ts'

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

/** Recursively assert a JSON value carries no undefined. */
function assertNoUndefined(value: unknown, path = 'root'): void {
  if (value === undefined) throw new Error(`undefined at ${path}`)
  if (Array.isArray(value)) value.forEach((item, index) => assertNoUndefined(item, `${path}[${index}]`))
  else if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) assertNoUndefined(child, `${path}.${key}`)
  }
}

describe('loan_payment tool', () => {
  it('computes the classic 300k @ 4% / 30y loan', async () => {
    const out = await tools.loan_payment.execute({ principal: 300000, annual_rate_percent: 4, months: 360 })
    expect(out.valid).toBe(true)
    expect(out.monthly_payment).toBeCloseTo(1432.25, 2)
    expect(out.total_interest).toBeCloseTo(215610, 0)
    expect(out.payoff_months).toBe(360)
    expect('months_saved' in out).toBe(false)
    assertNoUndefined(out)
  })

  it('reports extra-payment impact', async () => {
    const out = await tools.loan_payment.execute({ principal: 300000, annual_rate_percent: 4, months: 360, extra_principal_per_month: 100 })
    expect(out.valid).toBe(true)
    expect(out.months_saved).toBeGreaterThan(0)
    expect(out.interest_saved).toBeGreaterThan(0)
    expect(out.payoff_months).toBe(360 - (out.months_saved ?? 0))
    assertNoUndefined(out)
  })

  it('returns a capped schedule on request', async () => {
    const out = await tools.loan_payment.execute({ principal: 100000, annual_rate_percent: 5, months: 600, include_schedule: true })
    expect(out.valid).toBe(true)
    expect(Array.isArray(out.schedule)).toBe(true)
    expect(out.schedule?.length).toBe(360)
    expect(out.truncated).toBe(true)
    assertNoUndefined(out)
  })

  it('reports invalid input without throwing', async () => {
    const out = await tools.loan_payment.execute({ principal: -1, annual_rate_percent: 4, months: 12 })
    expect(out.valid).toBe(false)
    expect(typeof out.reason).toBe('string')
    expect((out.reason as string).length).toBeGreaterThan(0)
    assertNoUndefined(out)
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
    assertNoUndefined(out)
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
    assertNoUndefined(out)
  })

  it('rejects invalid compounding at the schema gate', async () => {
    await expect(
      tools.compound_growth.execute({ principal: 1000, annual_rate_percent: 5, years: 10, compounding: 'weekly' as never }),
    ).rejects.toThrow(/compounding/)
    const negative = await tools.compound_growth.execute({ principal: 0, annual_rate_percent: 5, years: 10, compounding: 'monthly' })
    expect(negative.valid).toBe(false)
    assertNoUndefined(negative)
  })
})

describe('rate_convert tool', () => {
  it('converts nominal → EAR (textbook 12.682503%)', async () => {
    const out = await tools.rate_convert.execute({ rate_percent: 12, input_kind: 'nominal', compounding: 'monthly' })
    expect(out.valid).toBe(true)
    expect(out.output_kind).toBe('effective (EAR)')
    expect(out.output_rate_percent).toBeCloseTo(12.682503, 5)
    assertNoUndefined(out)
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
    assertNoUndefined(out)
  })

  it('flags multiple sign changes instead of fabricating an IRR', async () => {
    const out = await execCashflow({ cash_flows: [-100, 230, -132], discount_rate_percent: 8 })
    expect(out.valid).toBe(true)
    expect(out.multiple_irr_possible).toBe(true)
    expect('irr_percent' in out).toBe(false)
    expect(typeof out.irr_note).toBe('string')
    assertNoUndefined(out)
  })

  it('reports invalid inputs without throwing', async () => {
    const out = await execCashflow({ cash_flows: [100] })
    expect(out.valid).toBe(false)
    expect(typeof out.reason).toBe('string')
    assertNoUndefined(out)
  })
})

describe('retirement_plan tool', () => {
  it('computes the sustainable withdrawal for a horizon', async () => {
    const out = await execRetirement({ principal: 1000000, annual_rate_percent: 4, years: 30 })
    expect(out.valid).toBe(true)
    expect(out.sustainable_monthly_withdrawal).toBeCloseTo(4774.15, 2)
    expect(out.total_withdrawn).toBeCloseTo(1718694, 0)
    expect('months_to_exhaust' in out).toBe(false)
    assertNoUndefined(out)
  })

  it('computes time to exhaustion for a withdrawal', async () => {
    const out = await execRetirement({ principal: 1000000, annual_rate_percent: 4, monthly_withdrawal: 4000 })
    expect(out.valid).toBe(true)
    expect(out.months_to_exhaust).toBeCloseTo(538.42, 2)
    expect(out.withdrawal_rate_percent).toBeCloseTo(4.8, 6)
    assertNoUndefined(out)
  })

  it('combines withdrawal and horizon into lasts_horizon', async () => {
    const out = await execRetirement({ principal: 1000000, annual_rate_percent: 4, monthly_withdrawal: 5000, years: 30 })
    expect(out.valid).toBe(true)
    expect(out.lasts_horizon).toBe(false)
    assertNoUndefined(out)
  })

  it('reports invalid inputs without throwing', async () => {
    const out = await execRetirement({ principal: 1000000, annual_rate_percent: 4 })
    expect(out.valid).toBe(false)
    expect(typeof out.reason).toBe('string')
    assertNoUndefined(out)
  })
})
