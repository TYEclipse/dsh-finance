/**
 * Core multi-debt payoff tests — every numeric expectation below is printed by
 * the independent oracle, which computes the plan with a plain month-by-month
 * simulation plus closed forms and cross-checks single debts against the
 * loop-free payoff formula.
 *
 * ORACLE: test/oracle/anchors.py — cases D1–D8 print every value asserted here.
 *
 * @module dsh-finance/test
 */

import { describe, expect, it } from 'vitest'
import { computeDebtPayoff, MAX_DEBTS, type DebtPayoffResult } from '../src/debt.ts'
import { assertLossless } from './helpers/lossless-json.ts'

type Debts = Array<{ name?: string; balance: number; annualRatePercent: number; minimumPayment: number }>

function plan(debts: Debts, monthlyBudget: number, strategy?: 'avalanche' | 'snowball') {
  const result = computeDebtPayoff({ debts, monthlyBudget, strategy })
  if (!('debtCount' in result)) throw new Error(`unexpected invalid: ${result.reason}`)
  return result as DebtPayoffResult
}

const D1: Debts = [
  { name: 'card A', balance: 5000, annualRatePercent: 22, minimumPayment: 100 },
  { name: 'card B', balance: 2000, annualRatePercent: 12, minimumPayment: 50 },
]

describe('avalanche vs snowball', () => {
  it('pays the 22% card first and reports both orderings (D1)', () => {
    const result = plan(D1, 600)
    expect(result.strategy).toBe('avalanche')
    expect(result.priorityOrder).toEqual(['card A', 'card B'])
    expect(result.totalBalance).toBe(7000)
    expect(result.totalMinimums).toBe(150)
    expect(result.extraPerMonth).toBe(450)
    expect(result.debtFree).toBe(true)
    expect(result.monthsToDebtFree).toBe(13)
    expect(result.totalPaid).toBeCloseTo(7739.37, 2)
    expect(result.totalInterest).toBeCloseTo(739.37, 2)
    expect(result.payoffOrder).toEqual([
      { name: 'card A', clearedMonth: 11, interestPaid: 519.81, paid: 5519.81 },
      { name: 'card B', clearedMonth: 13, interestPaid: 219.56, paid: 2219.56 },
    ])
    assertLossless(result)
  })

  it('reports the snowball run side by side and who wins (D1)', () => {
    const result = plan(D1, 600)
    expect(result.comparison).toEqual([
      { strategy: 'avalanche', debtFree: true, monthsToDebtFree: 13, totalInterest: 739.37 },
      { strategy: 'snowball', debtFree: true, monthsToDebtFree: 14, totalInterest: 895.7 },
    ])
    expect(result.bestStrategy).toBe('avalanche')
    expect(result.interestSavedByBest).toBeCloseTo(156.33, 2)
    expect(result.monthsSavedByBest).toBe(1)
  })

  it('honours a requested snowball plan (D5)', () => {
    const result = plan([
      { name: 'visa', balance: 8000, annualRatePercent: 19.99, minimumPayment: 160 },
      { name: 'car', balance: 1200, annualRatePercent: 9, minimumPayment: 25 },
      { name: 'student', balance: 15000, annualRatePercent: 5.5, minimumPayment: 200 },
    ], 800, 'snowball')
    expect(result.strategy).toBe('snowball')
    expect(result.priorityOrder).toEqual(['car', 'visa', 'student'])
    expect(result.monthsToDebtFree).toBe(35)
    expect(result.totalPaid).toBeCloseTo(27322.1, 2)
    expect(result.totalInterest).toBeCloseTo(3122.1, 2)
    expect(result.payoffOrder.map((row) => [row.name, row.clearedMonth])).toEqual([
      ['car', 3],
      ['visa', 18],
      ['student', 35],
    ])
    // The requested plan is not the cheaper one — that is the point of the comparison.
    expect(result.bestStrategy).toBe('avalanche')
    expect(result.interestSavedByBest).toBeCloseTo(183.03, 2)
    expect(result.monthsSavedByBest).toBe(1)
  })

  it('avalanche is never the more expensive ordering (D7)', () => {
    const result = plan([
      { name: 'small low-rate', balance: 500, annualRatePercent: 5, minimumPayment: 250 },
      { name: 'big high-rate', balance: 10000, annualRatePercent: 25, minimumPayment: 100 },
    ], 400)
    expect(result.monthsToDebtFree).toBe(39)
    expect(result.totalInterest).toBeCloseTo(4829.87, 2)
    expect(result.bestStrategy).toBe('avalanche')
    expect(result.interestSavedByBest).toBeCloseTo(1.89, 2)
    expect(result.monthsSavedByBest).toBe(0)
  })
})

describe('single-debt and edge cases', () => {
  it('zero-rate debt is pure balance / budget (D2)', () => {
    const result = plan([{ name: 'loan', balance: 1200, annualRatePercent: 0, minimumPayment: 100 }], 300)
    expect(result.monthsToDebtFree).toBe(4)
    expect(result.totalPaid).toBe(1200)
    expect(result.totalInterest).toBe(0)
    expect(result.bestStrategy).toBe('tie')
    expect(result.interestSavedByBest).toBe(0)
    expect(result.payoffOrder).toEqual([{ name: 'loan', clearedMonth: 4, interestPaid: 0, paid: 1200 }])
  })

  it('a budget of only minimums below the interest never clears (D3)', () => {
    const result = plan([{ name: 'store card', balance: 1000, annualRatePercent: 24, minimumPayment: 10 }], 10)
    expect(result.debtFree).toBe(false)
    expect(result.monthsToDebtFree).toBeUndefined()
    expect(result.totalInterest).toBeUndefined()
    expect(result.payoffOrder).toEqual([])
    expect(result.note).toMatch(/never clears/)
    expect(result.comparison.every((entry) => entry.debtFree === false)).toBe(true)
    expect('best_strategy' in result).toBe(false)
  })

  it('two debts at the same rate with the same minimum tie (D4)', () => {
    const result = plan([
      { name: 'one', balance: 1000, annualRatePercent: 18, minimumPayment: 50 },
      { name: 'two', balance: 2000, annualRatePercent: 18, minimumPayment: 50 },
    ], 200)
    expect(result.monthsToDebtFree).toBe(18)
    expect(result.totalInterest).toBeCloseTo(424.15, 2)
    expect(result.bestStrategy).toBe('tie')
    expect(result.interestSavedByBest).toBe(0)
    expect(result.payoffOrder.map((row) => row.clearedMonth)).toEqual([8, 18])
  })

  it('three identical debts tie and clear in order (D8)', () => {
    const result = plan([
      { name: 'a', balance: 3000, annualRatePercent: 20, minimumPayment: 75 },
      { name: 'b', balance: 3000, annualRatePercent: 20, minimumPayment: 75 },
      { name: 'c', balance: 3000, annualRatePercent: 20, minimumPayment: 75 },
    ], 300)
    expect(result.monthsToDebtFree).toBe(42)
    expect(result.totalInterest).toBeCloseTo(3580.49, 2)
    expect(result.bestStrategy).toBe('tie')
    expect(result.payoffOrder.map((row) => [row.name, row.clearedMonth])).toEqual([['a', 25], ['b', 36], ['c', 42]])
  })

  it('cents-level debt clears in three months (D6)', () => {
    const result = plan([{ name: 'tiny', balance: 10, annualRatePercent: 30, minimumPayment: 5 }], 5)
    expect(result.monthsToDebtFree).toBe(3)
    expect(result.totalPaid).toBeCloseTo(10.39, 2)
    expect(result.totalInterest).toBeCloseTo(0.39, 2)
    expect(result.bestStrategy).toBe('tie')
  })

  it('defaults the strategy to avalanche and names unnamed debts positionally', () => {
    const result = plan([
      { balance: 5000, annualRatePercent: 22, minimumPayment: 100 },
      { balance: 2000, annualRatePercent: 12, minimumPayment: 50 },
    ], 600)
    expect(result.strategy).toBe('avalanche')
    expect(result.priorityOrder).toEqual(['debt 1', 'debt 2'])
    expect(result.monthsToDebtFree).toBe(13)
  })

  it('a negative rate (deflation) still solves without inventing a term', () => {
    const result = plan([{ name: 'x', balance: 1000, annualRatePercent: -1, minimumPayment: 50 }], 100)
    expect(result.debtFree).toBe(true)
    expect(typeof result.monthsToDebtFree).toBe('number')
    expect(result.monthsToDebtFree).toBeGreaterThan(0)
  })

  it('the per-debt interest adds up to the reported total (cents)', () => {
    const result = plan(D1, 600)
    const sum = result.payoffOrder.reduce((acc, row) => acc + row.interestPaid, 0)
    expect(sum).toBeCloseTo(result.totalInterest as number, 1)
    const paid = result.payoffOrder.reduce((acc, row) => acc + row.paid, 0)
    expect(paid).toBeCloseTo(result.totalPaid as number, 1)
  })
})

describe('validation', () => {
  it('rejects a budget below the sum of the minimum payments', () => {
    const result = computeDebtPayoff({ debts: D1, monthlyBudget: 100 })
    expect('debtCount' in result).toBe(false)
    expect((result as { reason: string }).reason).toContain('150.00')
  })

  it('rejects empty and oversized debt lists', () => {
    expect('debtCount' in computeDebtPayoff({ debts: [], monthlyBudget: 100 })).toBe(false)
    const many = Array.from({ length: MAX_DEBTS + 1 }, () => ({ balance: 100, annualRatePercent: 10, minimumPayment: 10 }))
    const result = computeDebtPayoff({ debts: many, monthlyBudget: 500 })
    expect('debtCount' in result).toBe(false)
    expect((result as { reason: string }).reason).toContain(String(MAX_DEBTS))
  })

  it('rejects bad field values with a field-level reason', () => {
    const cases: Array<[Debts, number]> = [
      [[{ balance: -1, annualRatePercent: 10, minimumPayment: 10 }], 100],
      [[{ balance: 100, annualRatePercent: -101, minimumPayment: 10 }], 100],
      [[{ balance: 100, annualRatePercent: 10, minimumPayment: 0 }], 100],
      [[{ balance: Number.NaN, annualRatePercent: 10, minimumPayment: 10 }], 100],
      [[{ balance: 100, annualRatePercent: 10, minimumPayment: 10 }], 0],
      [[{ balance: 100, annualRatePercent: 10, minimumPayment: 10 }], Number.NaN],
    ]
    for (const [debts, budget] of cases) {
      const result = computeDebtPayoff({ debts, monthlyBudget: budget })
      expect('debtCount' in result, `expected invalid for ${JSON.stringify(debts)} @ ${budget}`).toBe(false)
      expect((result as { reason: string }).reason.length).toBeGreaterThan(0)
    }
  })
})
