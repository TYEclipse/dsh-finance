/**
 * Tests for the purchasing-power math (`inflation_adjust`).
 *
 * ORACLE: test/oracle/anchors.py — every number below is printed by that
 * independent script (`python3 test/oracle/anchors.py`, cases I1–I7); nothing
 * here is hand-computed. Reference anchors (oracle output):
 *   I1  1000, 2.5%, 10y            → 1280.08 / 781.20 (120 months)
 *   I2  1000, 2.5%, 10y, nominal 6 → real 3.414634%, nominal fv 1790.85, real fv 1399.01
 *   I3  100000, 0%, 5y, nominal 7  → 100000 / 100000, real 7%, fv 140255.17 both sides
 *   I4  100000, 3%, 30y, nominal 3 → 242726.25 / 41198.68, real 0%, real fv 100000
 *   I5  5000, −1%, 2y (deflation)  → 4900.50 / 5101.52
 *   I6  1000, 2%, 0.5y             → 1009.95 / 990.15 (6 months)
 *   I7  1200, 6%, 1/12 (one month) → 1205.84 / 1194.19
 *
 * @module dsh-finance/test/inflation
 */

import { describe, expect, it } from 'vitest'
import { computeInflation } from '../src/inflation.ts'

/** Narrow to the success shape (or fail loudly). */
function ok(value: ReturnType<typeof computeInflation>) {
  if ('ok' in value) throw new Error(`unexpected validation failure: ${value.reason}`)
  return value
}

describe('computeInflation — purchasing power', () => {
  it('turns 1000 today into a 1280.08 cost after 10 years at 2.5%', () => {
    const r = ok(computeInflation({ amount: 1000, annualInflationPercent: 2.5, years: 10 }))
    expect(r.months).toBe(120)
    expect(r.futureCost).toBeCloseTo(1280.08, 2)
    expect(r.realValue).toBeCloseTo(781.2, 2)
    expect(r.realRatePercent).toBeUndefined()
  })

  it('is the identity at zero inflation', () => {
    const r = ok(computeInflation({ amount: 100000, annualInflationPercent: 0, years: 5, nominalRatePercent: 7 }))
    expect(r.futureCost).toBeCloseTo(100000, 2)
    expect(r.realValue).toBeCloseTo(100000, 2)
    expect(r.realRatePercent).toBeCloseTo(7, 6)
    expect(r.nominalFutureValue).toBeCloseTo(140255.17, 2)
    expect(r.realFutureValue).toBeCloseTo(140255.17, 2)
  })

  it('applies the exact Fisher relation (6% nominal over 2.5% inflation)', () => {
    const r = ok(computeInflation({ amount: 1000, annualInflationPercent: 2.5, years: 10, nominalRatePercent: 6 }))
    expect(r.realRatePercent).toBeCloseTo(3.414634, 6)
    expect(r.nominalFutureValue).toBeCloseTo(1790.85, 2)
    expect(r.realFutureValue).toBeCloseTo(1399.01, 2)
  })

  it('reports a zero real return when nominal equals inflation', () => {
    const r = ok(computeInflation({ amount: 100000, annualInflationPercent: 3, years: 30, nominalRatePercent: 3 }))
    expect(r.realRatePercent).toBeCloseTo(0, 6)
    expect(r.futureCost).toBeCloseTo(242726.25, 2)
    expect(r.realValue).toBeCloseTo(41198.68, 2)
    expect(r.nominalFutureValue).toBeCloseTo(242726.25, 2)
    expect(r.realFutureValue).toBeCloseTo(100000, 2)
  })

  it('handles deflation (negative inflation) without clamping', () => {
    const r = ok(computeInflation({ amount: 5000, annualInflationPercent: -1, years: 2 }))
    expect(r.months).toBe(24)
    expect(r.futureCost).toBeCloseTo(4900.5, 2)
    expect(r.realValue).toBeCloseTo(5101.52, 2)
  })

  it('accepts fractional horizons and echoes the whole months', () => {
    const r = ok(computeInflation({ amount: 1000, annualInflationPercent: 2, years: 0.5 }))
    expect(r.months).toBe(6)
    expect(r.futureCost).toBeCloseTo(1009.95, 2)
    expect(r.realValue).toBeCloseTo(990.15, 2)
  })

  it('accepts the smallest horizon (one month) and zero amount', () => {
    const one = ok(computeInflation({ amount: 1200, annualInflationPercent: 6, years: 1 / 12 }))
    expect(one.months).toBe(1)
    expect(one.futureCost).toBeCloseTo(1205.84, 2)
    const zero = ok(computeInflation({ amount: 0, annualInflationPercent: 3, years: 5 }))
    expect(zero.futureCost).toBe(0)
    expect(zero.realValue).toBe(0)
  })
})

describe('computeInflation — validation', () => {
  it('rejects a negative amount', () => {
    expect(computeInflation({ amount: -1, annualInflationPercent: 2, years: 1 }))
      .toEqual({ ok: false, reason: 'amount must be a non-negative number' })
  })

  it('rejects inflation at or below −100%', () => {
    expect(computeInflation({ amount: 1000, annualInflationPercent: -100, years: 1 }))
      .toEqual({ ok: false, reason: 'annual_inflation_percent must be greater than -100' })
    expect(computeInflation({ amount: 1000, annualInflationPercent: Number.POSITIVE_INFINITY, years: 1 }))
      .toEqual({ ok: false, reason: 'annual_inflation_percent must be greater than -100' })
  })

  it('rejects horizons outside 1/12 … 200 years', () => {
    expect(computeInflation({ amount: 1000, annualInflationPercent: 2, years: 0 }))
      .toEqual({ ok: false, reason: 'years must be between 1/12 and 200' })
    expect(computeInflation({ amount: 1000, annualInflationPercent: 2, years: 200.5 }))
      .toEqual({ ok: false, reason: 'years must be between 1/12 and 200' })
  })

  it('rejects a nominal return at or below −100%', () => {
    expect(computeInflation({ amount: 1000, annualInflationPercent: 2, years: 1, nominalRatePercent: -100 }))
      .toEqual({ ok: false, reason: 'nominal_rate_percent must be greater than -100' })
  })
})
