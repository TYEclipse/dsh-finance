/**
 * Multi-debt payoff planning for dsh-finance — what actually happens when a
 * fixed monthly budget is spread over several balances: avalanche (highest
 * rate first) versus snowball (smallest balance first). Pure arithmetic,
 * deterministic, offline.
 *
 * Conventions match the rest of the plugin: each debt compounds monthly at
 * annual_rate_percent / 12, every minimum payment is made first (they are
 * contractual), the leftover budget attacks one target debt at a time, and
 * amounts are rounded to cents only at the output boundary. Balances are
 * carried at full precision inside the loop, so the reported interest is the
 * true total and not a sum of rounded rows.
 *
 * Honesty rules worth keeping: the pay-off order is the order balances
 * actually reach zero, not the priority order; a plan that never clears the
 * debt (budget that only covers minimums below the interest charge) reports
 * `debtFree: false` with a note instead of inventing a month count; and both
 * strategies are simulated in full, because the "avalanche always wins"
 * folklore is exactly the sort of claim that should come out of the numbers.
 *
 * @module dsh-finance/debt
 */

import { round2 } from './finance.ts'

/** Upper bound on the number of debts in one plan. */
export const MAX_DEBTS = 10
/** Iteration cap (100 years) before a plan is declared endless. */
export const MAX_PAYOFF_MONTHS = 1200
/** Balance below this is dust and snaps to zero. */
const ZERO_EPS = 1e-9
/** Widest name we echo back. */
const MAX_NAME_CHARS = 40

/** Payoff strategies: highest rate first, or smallest balance first. */
export type DebtStrategy = 'avalanche' | 'snowball'

/** One debt in the plan, as given. */
export interface DebtInput {
  name?: string
  balance: number
  annualRatePercent: number
  minimumPayment: number
}

/** Validation failure — tools surface this as valid:false with a reason. */
export interface DebtIssue {
  ok: false
  reason: string
}

/** Per-debt payoff record. */
export interface DebtPayoffRow {
  name: string
  /** Month the balance reached zero (1-based). */
  clearedMonth: number
  /** Interest paid on this debt over its life (rounded to cents). */
  interestPaid: number
  /** Everything paid towards this debt, principal + interest (rounded to cents). */
  paid: number
}

/** Outcome of one strategy over the whole plan. */
export interface DebtStrategyOutcome {
  strategy: DebtStrategy
  debtFree: boolean
  monthsToDebtFree?: number
  totalPaid?: number
  totalInterest?: number
  payoffOrder: DebtPayoffRow[]
}

/** Full payoff plan result; optional fields are present only when meaningful. */
export interface DebtPayoffResult {
  monthlyBudget: number
  debtCount: number
  totalBalance: number
  totalMinimums: number
  /** Budget left over after every minimum payment (rounded to cents). */
  extraPerMonth: number
  strategy: DebtStrategy
  /** Order the leftover budget attacks debts in (strategy priority, month 1). */
  priorityOrder: string[]
  debtFree: boolean
  monthsToDebtFree?: number
  totalPaid?: number
  totalInterest?: number
  payoffOrder: DebtPayoffRow[]
  comparison: Array<{
    strategy: DebtStrategy
    debtFree: boolean
    monthsToDebtFree?: number
    totalInterest?: number
  }>
  bestStrategy?: DebtStrategy | 'tie'
  interestSavedByBest?: number
  monthsSavedByBest?: number
  note?: string
}

/** Normalised debt used by the simulation. */
interface NormalDebt {
  name: string
  balance: number
  rate: number
  minimum: number
}

/** Round money and fold -0 into 0 (JSON.stringify(-0) === "0", R66 anchor). */
function roundMoney(value: number): number {
  const rounded = round2(value)
  return rounded === 0 ? 0 : rounded
}

/** Trim and cap an echoed name, falling back to a positional default. */
function normaliseName(raw: string | undefined, index: number): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (trimmed === '') return `debt ${index + 1}`
  return trimmed.length > MAX_NAME_CHARS ? trimmed.slice(0, MAX_NAME_CHARS) : trimmed
}

/** Mutable working copy of one debt inside the simulation. */
interface WorkingDebt {
  index: number
  debt: NormalDebt
  balance: number
  interestPaid: number
  paid: number
  clearedMonth: number
}

/**
 * Simulate the payoff plan for one strategy.
 *
 * Each month: interest accrues on every open balance, every minimum payment
 * is made, then the remaining budget attacks open debts in priority order
 * (highest rate first for avalanche, smallest balance first for snowball,
 * position as the tie-break). A debt is recorded as cleared in the month its
 * balance first reaches zero.
 */
function simulate(debts: NormalDebt[], budget: number, strategy: DebtStrategy): DebtStrategyOutcome {
  const work: WorkingDebt[] = debts.map((debt, index) => ({
    index,
    debt,
    balance: debt.balance,
    interestPaid: 0,
    paid: 0,
    clearedMonth: 0,
  }))
  let interestTotal = 0
  let paidTotal = 0
  let monthsToDebtFree = 0

  for (let month = 1; month <= MAX_PAYOFF_MONTHS; month += 1) {
    const open = work.filter((entry) => entry.balance > 0)
    if (open.length === 0) break

    for (const entry of open) {
      const interest = entry.balance * entry.debt.rate
      entry.balance += interest
      entry.interestPaid += interest
      interestTotal += interest
    }

    let remaining = budget
    for (const entry of work) {
      if (entry.balance <= 0) continue
      let pay = Math.min(entry.debt.minimum, entry.balance)
      if (pay > remaining) pay = remaining
      entry.balance -= pay
      entry.paid += pay
      paidTotal += pay
      remaining -= pay
    }

    const targets = open.slice().sort((a, b) => {
      if (strategy === 'avalanche' && b.debt.rate !== a.debt.rate) return b.debt.rate - a.debt.rate
      if (strategy === 'snowball' && a.balance !== b.balance) return a.balance - b.balance
      return a.index - b.index
    })
    for (const entry of targets) {
      if (remaining <= ZERO_EPS) break
      if (entry.balance <= 0) continue
      const pay = Math.min(remaining, entry.balance)
      entry.balance -= pay
      entry.paid += pay
      paidTotal += pay
      remaining -= pay
    }

    for (const entry of work) {
      if (entry.balance > 0 && entry.balance < ZERO_EPS) entry.balance = 0
      if (entry.balance === 0 && entry.clearedMonth === 0) entry.clearedMonth = month
    }

    monthsToDebtFree = month
    if (work.every((entry) => entry.clearedMonth > 0)) break
  }

  const payoffOrder: DebtPayoffRow[] = work
    .filter((entry) => entry.clearedMonth > 0)
    .sort((a, b) => (a.clearedMonth !== b.clearedMonth ? a.clearedMonth - b.clearedMonth : a.index - b.index))
    .map((entry) => ({
      name: entry.debt.name,
      clearedMonth: entry.clearedMonth,
      interestPaid: roundMoney(entry.interestPaid),
      paid: roundMoney(entry.paid),
    }))

  const debtFree = monthsToDebtFree > 0 && work.every((entry) => entry.clearedMonth > 0)
  const outcome: DebtStrategyOutcome = {
    strategy,
    debtFree,
    payoffOrder,
  }
  if (debtFree) {
    outcome.monthsToDebtFree = monthsToDebtFree
    outcome.totalPaid = roundMoney(paidTotal)
    outcome.totalInterest = roundMoney(interestTotal)
  }
  return outcome
}

/** Priority order the leftover budget attacks debts in, from the initial state. */
function priorityOrder(debts: NormalDebt[], strategy: DebtStrategy): string[] {
  return debts
    .map((debt, index) => ({ debt, index }))
    .sort((a, b) => {
      if (strategy === 'avalanche' && b.debt.rate !== a.debt.rate) return b.debt.rate - a.debt.rate
      if (strategy === 'snowball' && a.debt.balance !== b.debt.balance) return a.debt.balance - b.debt.balance
      return a.index - b.index
    })
    .map((entry) => entry.debt.name)
}

/**
 * Plan the payoff of several debts against one monthly budget, for the
 * requested strategy and for both strategies side by side (so the
 * avalanche-vs-snowball difference is a number, not a slogan).
 */
export function computeDebtPayoff(input: {
  debts: DebtInput[]
  monthlyBudget: number
  strategy?: DebtStrategy
}): DebtPayoffResult | DebtIssue {
  const raw = input.debts
  if (!Array.isArray(raw) || raw.length < 1) {
    return { ok: false, reason: 'debts must be an array with at least 1 entry' }
  }
  if (raw.length > MAX_DEBTS) {
    return { ok: false, reason: `debts is capped at ${MAX_DEBTS} entries` }
  }

  const debts: NormalDebt[] = []
  for (const [i, raw_entry] of raw.entries()) {
    const entry = raw_entry as DebtInput | null | undefined
    const label = `debts[${i}]`
    if (entry === null || typeof entry !== 'object') {
      return { ok: false, reason: `${label} must be an object with balance, annual_rate_percent and minimum_payment` }
    }
    if (!Number.isFinite(entry.balance) || entry.balance <= 0) {
      return { ok: false, reason: `${label}.balance must be a positive number` }
    }
    if (!Number.isFinite(entry.annualRatePercent) || entry.annualRatePercent <= -100) {
      return { ok: false, reason: `${label}.annual_rate_percent must be greater than -100` }
    }
    if (!Number.isFinite(entry.minimumPayment) || entry.minimumPayment <= 0) {
      return { ok: false, reason: `${label}.minimum_payment must be a positive number` }
    }
    debts.push({
      name: normaliseName(entry.name, i),
      balance: entry.balance,
      rate: entry.annualRatePercent / 100 / 12,
      minimum: entry.minimumPayment,
    })
  }

  const budget = input.monthlyBudget
  if (!Number.isFinite(budget) || budget <= 0) {
    return { ok: false, reason: 'monthly_budget must be a positive number' }
  }
  const minimums = debts.reduce((sum, debt) => sum + debt.minimum, 0)
  if (budget < minimums - ZERO_EPS) {
    return {
      ok: false,
      reason: `monthly_budget must be at least the sum of the minimum payments (${roundMoney(minimums).toFixed(2)})`,
    }
  }

  const strategy: DebtStrategy = input.strategy === 'snowball' ? 'snowball' : 'avalanche'
  const primary = simulate(debts, budget, strategy)
  const other = simulate(debts, budget, strategy === 'avalanche' ? 'snowball' : 'avalanche')

  const result: DebtPayoffResult = {
    monthlyBudget: roundMoney(budget),
    debtCount: debts.length,
    totalBalance: roundMoney(debts.reduce((sum, debt) => sum + debt.balance, 0)),
    totalMinimums: roundMoney(minimums),
    extraPerMonth: roundMoney(budget - minimums),
    strategy,
    priorityOrder: priorityOrder(debts, strategy),
    debtFree: primary.debtFree,
    payoffOrder: primary.payoffOrder,
    comparison: [
      {
        strategy: primary.strategy,
        debtFree: primary.debtFree,
        ...(primary.monthsToDebtFree === undefined ? {} : { monthsToDebtFree: primary.monthsToDebtFree }),
        ...(primary.totalInterest === undefined ? {} : { totalInterest: primary.totalInterest }),
      },
      {
        strategy: other.strategy,
        debtFree: other.debtFree,
        ...(other.monthsToDebtFree === undefined ? {} : { monthsToDebtFree: other.monthsToDebtFree }),
        ...(other.totalInterest === undefined ? {} : { totalInterest: other.totalInterest }),
      },
    ],
  }

  if (primary.debtFree) {
    result.monthsToDebtFree = primary.monthsToDebtFree
    result.totalPaid = primary.totalPaid
    result.totalInterest = primary.totalInterest
  } else {
    result.note = `the budget never clears every balance within ${MAX_PAYOFF_MONTHS} months`
      + ' — the minimum payments do not cover the interest charged'
  }

  if (primary.debtFree && other.debtFree) {
    if (primary.totalInterest === other.totalInterest) result.bestStrategy = 'tie'
    else result.bestStrategy = (primary.totalInterest ?? 0) < (other.totalInterest ?? 0) ? primary.strategy : other.strategy
    result.interestSavedByBest = roundMoney(Math.abs((primary.totalInterest ?? 0) - (other.totalInterest ?? 0)))
    result.monthsSavedByBest = Math.abs((primary.monthsToDebtFree ?? 0) - (other.monthsToDebtFree ?? 0))
  }

  return result
}
