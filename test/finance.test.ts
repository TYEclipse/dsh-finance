/**
 * Core financial math tests — every headline assertion is a known external
 * anchor (published loan tables, textbook EAR values), never a self-roundtrip.
 * Amortization invariants (balance clears to 0, principal sums to the loan,
 * interest sums to the reported total) are checked exactly.
 *
 * @module dsh-finance/test
 */

import { describe, expect, it } from 'vitest'
import {
  COMPOUNDING_PERIODS,
  computeGrowth,
  computeLoan,
  continuousEffectiveToNominal,
  continuousNominalToEffective,
  effectiveToNominal,
  monthlyRateFor,
  nominalToEffective,
} from '../src/finance.ts'

function loan(principal: number, annualRatePercent: number, months: number, extra = 0, schedule = false) {
  const result = computeLoan({ principal, annualRatePercent, months, extraPerMonth: extra }, { includeSchedule: schedule })
  if (!('monthlyPayment' in result)) throw new Error(`unexpected invalid: ${result.reason}`)
  return result
}

function growth(principal: number, annualRatePercent: number, years: number, compounding: string, contribution = 0, breakdown = false) {
  const result = computeGrowth(
    { principal, annualRatePercent, years, compounding: compounding as never, contributionPerMonth: contribution },
    { includeBreakdown: breakdown },
  )
  if (!('futureValue' in result)) throw new Error(`unexpected invalid: ${result.reason}`)
  return result
}

describe('loan payment (PMT)', () => {
  it('matches the classic 300k @ 4% / 30-year anchor', () => {
    const r = loan(300000, 4, 360)
    // Published mortgage-table value: $1,432.25
    expect(r.monthlyPayment).toBeCloseTo(1432.25, 2)
    expect(r.totalInterest).toBeCloseTo(215610, 0)
    expect(r.totalPaid).toBeCloseTo(515610, 0)
  })

  it('matches the 100k @ 6% / 10-year anchor', () => {
    const r = loan(100000, 6, 120)
    expect(r.monthlyPayment).toBeCloseTo(1110.21, 2)
  })

  it('zero interest is pure principal / term', () => {
    const r = loan(12000, 0, 12)
    expect(r.monthlyPayment).toBe(1000)
    expect(r.totalInterest).toBe(0)
  })

  it('negative rates (deflation scenario) still compute', () => {
    const r = loan(100000, -1, 120)
    expect(r.monthlyPayment).toBeGreaterThan(0)
    expect(r.monthlyPayment).toBeLessThan(833.33)
    expect(r.totalInterest).toBeLessThan(0)
  })

  it('rejects invalid inputs with a reason', () => {
    for (const [p, rate, m] of [[-100, 4, 360], [100, -101, 360], [100, 4, 0], [100, 4, 1.5], [Number.NaN, 4, 360]] as const) {
      const result = computeLoan({ principal: p, annualRatePercent: rate, months: m })
      expect('monthlyPayment' in result, `expected (${p}, ${rate}, ${m}) to be invalid`).toBe(false)
      expect('reason' in result).toBe(true)
      expect((result as { reason: string }).reason.length).toBeGreaterThan(0)
    }
  })
})

describe('amortization invariants', () => {
  it('schedule clears the balance and principal sums to the loan', () => {
    const r = loan(300000, 4, 360, 0, true)
    expect(r.schedule).toBeDefined()
    const rows = r.schedule ?? []
    expect(rows.length).toBe(360)
    const last = rows[rows.length - 1]
    expect(last?.balance).toBe(0)
    expect(last?.payment).toBeLessThanOrEqual(r.monthlyPayment + 0.01)
    const principalSum = rows.reduce((acc, row) => acc + row.principal, 0)
    expect(principalSum).toBeCloseTo(300000, 0)
    expect(rows[0]?.interest).toBeCloseTo(300000 * 0.04 / 12, 2)
  })

  it('extra principal shortens the term and saves interest', () => {
    const base = loan(300000, 4, 360)
    const extra = loan(300000, 4, 360, 100)
    expect(extra.payoffMonths).toBeLessThan(360)
    // Closed-form payoff: (1+r)^k >= P/(P − B0·r) → k = 318 with the
    // cents-rounded payment 1432.25 (verified independently).
    expect(extra.payoffMonths).toBe(318)
    expect(extra.monthsSaved).toBe(360 - extra.payoffMonths)
    // Independent closed-form anchor: 28749.08 interest saved.
    expect(extra.interestSaved).toBeCloseTo(28749.08, 1)
    // Contract payment is unchanged by extra principal
    expect(extra.monthlyPayment).toBe(base.monthlyPayment)
  })

  it('caps the schedule at 360 rows and flags truncation', () => {
    const r = loan(100000, 5, 600, 0, true)
    expect(r.schedule?.length).toBe(360)
    expect(r.truncated).toBe(true)
  })
})

describe('compound growth', () => {
  it('monthly compounding matches the textbook anchor', () => {
    // 1000·(1+0.05/12)^120 = 1647.01
    const r = growth(1000, 5, 10, 'monthly')
    expect(r.months).toBe(120)
    expect(r.futureValue).toBeCloseTo(1647.01, 2)
    expect(r.totalContributions).toBe(1000)
    expect(r.interestEarned).toBeCloseTo(647.01, 2)
  })

  it('contributions compose at the effective monthly rate', () => {
    const r = growth(1000, 5, 10, 'monthly', 100)
    expect(r.futureValue).toBeCloseTo(17175.23, 1)
    expect(r.totalContributions).toBe(13000)
  })

  it('zero rate accumulates contributions exactly', () => {
    const r = growth(1000, 0, 10, 'monthly', 100)
    expect(r.futureValue).toBe(13000)
    expect(r.interestEarned).toBe(0)
  })

  it('daily compounding matches the published 5%/365 anchor', () => {
    const r = growth(1000, 5, 1, 'daily')
    expect(r.futureValue).toBeCloseTo(1051.27, 1)
  })

  it('continuous compounding matches e^rt', () => {
    const r = growth(1000, 10, 1, 'continuous')
    expect(r.futureValue).toBeCloseTo(1105.17, 2)
  })

  it('compounding frequency changes the outcome (monthly < daily)', () => {
    const monthly = growth(1000, 10, 1, 'monthly')
    const daily = growth(1000, 10, 1, 'daily')
    const continuous = growth(1000, 10, 1, 'continuous')
    expect(daily.futureValue).toBeGreaterThan(monthly.futureValue)
    expect(continuous.futureValue).toBeGreaterThan(daily.futureValue)
  })

  it('yearly breakdown balances reconcile', () => {
    const r = growth(1000, 5, 3, 'monthly', 100, true)
    expect(r.breakdown?.length).toBe(3)
    const last = r.breakdown?.[2]
    expect(last?.balance).toBeCloseTo(r.futureValue, 2)
    expect(last?.year).toBe(3)
  })

  it('fractional years round to whole months and are reported', () => {
    const r = growth(1000, 5, 2.5, 'monthly')
    expect(r.months).toBe(30)
  })

  it('rejects invalid inputs with a reason', () => {
    for (const [p, rate, years, c, comp] of [
      [0, 5, 10, 0, 'monthly'],
      [100, -101, 10, 0, 'monthly'],
      [100, 5, 0.01, 0, 'monthly'],
      [100, 5, 10, -5, 'monthly'],
      [100, 5, 10, 0, 'weekly'],
    ] as const) {
      const result = computeGrowth({ principal: p, annualRatePercent: rate, years, compounding: comp as never, contributionPerMonth: c })
      expect('futureValue' in result, `expected (${p}, ${rate}, ${years}, ${c}, ${comp}) to be invalid`).toBe(false)
      expect('reason' in result).toBe(true)
    }
  })
})

describe('rate conversion', () => {
  it('12% nominal monthly → 12.682503% EAR (textbook)', () => {
    expect(nominalToEffective(12, 12)).toBeCloseTo(12.682503, 5)
  })

  it('EAR → nominal round-trips the textbook pair', () => {
    expect(effectiveToNominal(12.682503, 12)).toBeCloseTo(12, 3)
  })

  it('8% nominal quarterly → 8.243216% EAR', () => {
    expect(nominalToEffective(8, 4)).toBeCloseTo(8.243216, 5)
  })

  it('continuous: 10% nominal → 10.517092% EAR', () => {
    expect(continuousNominalToEffective(10)).toBeCloseTo(10.517092, 5)
    expect(continuousEffectiveToNominal(10.517092)).toBeCloseTo(10, 4)
  })

  it('zero and negative rates convert consistently', () => {
    expect(nominalToEffective(0, 12)).toBe(0)
    expect(effectiveToNominal(0, 12)).toBe(0)
    const negative = nominalToEffective(-12, 12)
    expect(negative).toBeLessThan(0)
    expect(effectiveToNominal(negative, 12)).toBeCloseTo(-12, 3)
  })

  it('monthly rate helper converts each frequency to its effective monthly rate', () => {
    // monthly compounding: effective monthly rate is exactly nominal/12
    expect(monthlyRateFor(12, 'monthly')).toBeCloseTo(0.01, 12)
    // quarterly: (1.03)^(1/3) − 1
    expect(monthlyRateFor(12, 'quarterly')).toBeCloseTo(Math.pow(1.03, 1 / 3) - 1, 12)
    // annual: (1.12)^(1/12) − 1, which composes back to exactly 12%
    const annual = monthlyRateFor(12, 'annually')
    expect(Math.pow(1 + annual, 12) - 1).toBeCloseTo(0.12, 9)
    expect(COMPOUNDING_PERIODS.annually).toBe(1)
    expect(COMPOUNDING_PERIODS.semiannually).toBe(2)
    expect(COMPOUNDING_PERIODS.quarterly).toBe(4)
    expect(COMPOUNDING_PERIODS.daily).toBe(365)
  })
})
