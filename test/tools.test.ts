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
