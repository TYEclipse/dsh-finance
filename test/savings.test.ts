/**
 * Tests for the goal-based saving math (`savings_goal`).
 *
 * ORACLE: test/oracle/anchors.py — every number below is printed by that
 * independent script (`python3 test/oracle/anchors.py`, cases A1–A7/B1–B5);
 * nothing here is hand-computed. Reference anchors (oracle output):
 *   A1  target 50000, current 10000, 5%, 500/mo → 65 months, 50341.48,
 *       paid in 42500.00, interest 7841.48
 *   A2  target 12000, current 0, 0%, 1000/mo     → 12 months, 12000.00, 12000.00, 0
 *   A3  target 5000, current 6000, 3%, 100/mo    → month 0, 6000.00, 6000.00, 0
 *   A4  target 100000, current 1000, 0%, 0/mo    → unreachable
 *   A5  target 20000, current 10000, −2%, 600/mo → 18 months, 20352.56, 20800.00, −447.44
 *   B1  100000 / 20000 / 6% / 240 months         → 73.15, projected 100002.38, interest 62446.38
 *   B2  12000 / 0 / 0% / 24                      → 500.00, projected 12000.00, 0
 *   B3  10000 / 20000 / 5% / 60                  → 0.00, projected 25667.17, interest 5667.17
 *   B4  50000 / 0 / 4.8% / 12                    → 4075.80, projected 50000.09, interest 1090.49
 *
 * @module dsh-finance/test/savings
 */

import { describe, expect, it } from 'vitest'
import { computeSavingsGoal, MAX_GOAL_MONTHS } from '../src/savings.ts'

/** Narrow to the success shape (or fail loudly). */
function ok(value: ReturnType<typeof computeSavingsGoal>) {
  if ('ok' in value) throw new Error(`unexpected validation failure: ${value.reason}`)
  return value
}

describe('computeSavingsGoal — months to goal', () => {
  it('reaches 50k from 10k at 5% with 500/month in 65 months', () => {
    const r = ok(computeSavingsGoal({
      targetAmount: 50000,
      currentSavings: 10000,
      annualRatePercent: 5,
      monthlyContribution: 500,
    }))
    expect(r.monthsToGoal).toBe(65)
    expect(r.finalBalance).toBeCloseTo(50341.48, 2)
    expect(r.totalContributions).toBeCloseTo(42500, 2)
    expect(r.interestEarned).toBeCloseTo(7841.48, 2)
    expect(r.alreadyReached).toBeUndefined()
    expect(r.unreachable).toBeUndefined()
  })

  it('is plain arithmetic at zero rate (12000 from 0 at 1000/month)', () => {
    const r = ok(computeSavingsGoal({ targetAmount: 12000, annualRatePercent: 0, monthlyContribution: 1000 }))
    expect(r.monthsToGoal).toBe(12)
    expect(r.finalBalance).toBeCloseTo(12000, 2)
    expect(r.totalContributions).toBeCloseTo(12000, 2)
    expect(r.interestEarned).toBeCloseTo(0, 2)
  })

  it('defaults current_savings to zero', () => {
    const r = ok(computeSavingsGoal({ targetAmount: 1200, annualRatePercent: 0, monthlyContribution: 100 }))
    expect(r.currentSavings).toBe(0)
    expect(r.monthsToGoal).toBe(12)
  })

  it('reports an already-reached target without inventing contributions', () => {
    const r = ok(computeSavingsGoal({
      targetAmount: 5000,
      currentSavings: 6000,
      annualRatePercent: 3,
      monthlyContribution: 100,
    }))
    expect(r.alreadyReached).toBe(true)
    expect(r.monthsToGoal).toBe(0)
    expect(r.finalBalance).toBeCloseTo(6000, 2)
    expect(r.totalContributions).toBeCloseTo(6000, 2)
    expect(r.interestEarned).toBeCloseTo(0, 2)
  })

  it('flags an unreachable gap (no contribution, no return)', () => {
    const r = ok(computeSavingsGoal({
      targetAmount: 100000,
      currentSavings: 1000,
      annualRatePercent: 0,
      monthlyContribution: 0,
    }))
    expect(r.unreachable).toBe(true)
    expect(r.monthsToGoal).toBeUndefined()
    expect(r.finalBalance).toBeUndefined()
  })

  it('beats a shrinking balance with contributions (negative rate)', () => {
    const r = ok(computeSavingsGoal({
      targetAmount: 20000,
      currentSavings: 10000,
      annualRatePercent: -2,
      monthlyContribution: 600,
    }))
    expect(r.monthsToGoal).toBe(18)
    expect(r.finalBalance).toBeCloseTo(20352.56, 2)
    expect(r.totalContributions).toBeCloseTo(20800, 2)
    expect(r.interestEarned).toBeCloseTo(-447.44, 2)
  })
})

describe('computeSavingsGoal — required contribution', () => {
  it('asks for 73.15/month to reach 100k from 20k in 240 months at 6%', () => {
    const r = ok(computeSavingsGoal({
      targetAmount: 100000,
      currentSavings: 20000,
      annualRatePercent: 6,
      months: 240,
    }))
    expect(r.requiredMonthlyContribution).toBeCloseTo(73.15, 2)
    expect(r.horizonMonths).toBe(240)
    expect(r.projectedBalance).toBeCloseTo(100002.38, 2)
    expect(r.projectedInterest).toBeCloseTo(62446.38, 2)
  })

  it('splits the gap evenly at zero rate (12000 in 24 months)', () => {
    const r = ok(computeSavingsGoal({ targetAmount: 12000, annualRatePercent: 0, months: 24 }))
    expect(r.requiredMonthlyContribution).toBeCloseTo(500, 2)
    expect(r.projectedBalance).toBeCloseTo(12000, 2)
    expect(r.projectedInterest).toBeCloseTo(0, 2)
  })

  it('asks for nothing when the horizon growth alone covers the target', () => {
    const r = ok(computeSavingsGoal({
      targetAmount: 10000,
      currentSavings: 20000,
      annualRatePercent: 5,
      months: 60,
    }))
    expect(r.requiredMonthlyContribution).toBe(0)
    expect(r.projectedBalance).toBeCloseTo(25667.17, 2)
    expect(r.projectedInterest).toBeCloseTo(5667.17, 2)
  })

  it('rounds the required payment up so the plan actually arrives', () => {
    const r = ok(computeSavingsGoal({ targetAmount: 50000, annualRatePercent: 4.8, months: 12 }))
    expect(r.requiredMonthlyContribution).toBeCloseTo(4075.8, 2)
    expect(r.projectedBalance).toBeCloseTo(50000.09, 2)
    expect(r.projectedBalance).toBeGreaterThanOrEqual(50000)
    expect(r.projectedInterest).toBeCloseTo(1090.49, 2)
  })
})

describe('computeSavingsGoal — both modes', () => {
  it('confirms a plan that meets the deadline', () => {
    const r = ok(computeSavingsGoal({
      targetAmount: 50000,
      currentSavings: 10000,
      annualRatePercent: 5,
      monthlyContribution: 500,
      months: 66,
    }))
    expect(r.onTrack).toBe(true)
    expect(r.monthsToGoal).toBe(65)
    expect(r.requiredMonthlyContribution).toBeCloseTo(486.13, 2)
  })

  it('rejects a plan that misses the deadline', () => {
    const r = ok(computeSavingsGoal({
      targetAmount: 50000,
      currentSavings: 10000,
      annualRatePercent: 5,
      monthlyContribution: 500,
      months: 60,
    }))
    expect(r.onTrack).toBe(false)
  })

  it('treats an unreachable plan as off track', () => {
    const r = ok(computeSavingsGoal({
      targetAmount: 100000,
      currentSavings: 1000,
      annualRatePercent: 0,
      monthlyContribution: 0,
      months: 120,
    }))
    expect(r.unreachable).toBe(true)
    expect(r.onTrack).toBe(false)
  })
})

describe('computeSavingsGoal — validation', () => {
  it('rejects non-positive targets and rates at or below −100%', () => {
    expect(computeSavingsGoal({ targetAmount: 0, annualRatePercent: 5, monthlyContribution: 1 }))
      .toEqual({ ok: false, reason: 'target_amount must be a positive number' })
    expect(computeSavingsGoal({ targetAmount: 1000, annualRatePercent: -100, monthlyContribution: 1 }))
      .toEqual({ ok: false, reason: 'annual_rate_percent must be greater than -100' })
    expect(computeSavingsGoal({ targetAmount: 1000, annualRatePercent: Number.NaN, monthlyContribution: 1 }))
      .toEqual({ ok: false, reason: 'annual_rate_percent must be greater than -100' })
  })

  it('rejects negative current savings, negative contributions and bad months', () => {
    expect(computeSavingsGoal({ targetAmount: 1000, annualRatePercent: 5, currentSavings: -1, monthlyContribution: 1 }))
      .toEqual({ ok: false, reason: 'current_savings must be a non-negative number' })
    expect(computeSavingsGoal({ targetAmount: 1000, annualRatePercent: 5, monthlyContribution: -1 }))
      .toEqual({ ok: false, reason: 'monthly_contribution must be a non-negative number' })
    expect(computeSavingsGoal({ targetAmount: 1000, annualRatePercent: 5, months: 1.5 }))
      .toEqual({ ok: false, reason: `months must be an integer between 1 and ${MAX_GOAL_MONTHS}` })
    expect(computeSavingsGoal({ targetAmount: 1000, annualRatePercent: 5, months: 0 }))
      .toEqual({ ok: false, reason: `months must be an integer between 1 and ${MAX_GOAL_MONTHS}` })
  })

  it('requires at least one mode', () => {
    expect(computeSavingsGoal({ targetAmount: 1000, annualRatePercent: 5 }))
      .toEqual({ ok: false, reason: 'provide monthly_contribution and/or months (at least one is required)' })
  })

  it('tolerates a negative rate when contributions do the work', () => {
    // Oracle: −50%/yr (≈ −4.17%/month) with 150/month reaches 1000 at month 8
    // (balance 1038.85); 100/month needs 13 months (balance 1019.85), so it
    // misses a 12-month deadline.
    const tracked = ok(computeSavingsGoal({
      targetAmount: 1000,
      annualRatePercent: -50,
      monthlyContribution: 150,
      months: 12,
    }))
    expect(tracked.onTrack).toBe(true)
    expect(tracked.monthsToGoal).toBe(8)
    expect(tracked.finalBalance).toBeCloseTo(1038.85, 2)

    const tooSlow = ok(computeSavingsGoal({
      targetAmount: 1000,
      annualRatePercent: -50,
      monthlyContribution: 100,
      months: 12,
    }))
    expect(tooSlow.onTrack).toBe(false)
    expect(tooSlow.monthsToGoal).toBe(13)
    expect(tooSlow.finalBalance).toBeCloseTo(1019.85, 2)
    expect(tooSlow.unreachable).toBeUndefined()
  })
})
