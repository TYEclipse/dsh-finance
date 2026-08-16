/**
 * Core financial math for dsh-finance — pure, deterministic, zero-dependency
 * implementations of the standard time-value-of-money formulas:
 *   - fixed-rate loan payment (PMT) plus an amortization schedule,
 *     optionally with extra principal payments
 *   - future value of a lump sum with regular contributions (ordinary annuity)
 *   - nominal <-> effective annual rate conversion, incl. continuous compounding
 *
 * Money amounts are rounded to cents only at the output boundary; internal
 * iterations carry full floating-point precision and the final payment is
 * adjusted to clear the balance exactly (no residual dust).
 *
 * @module dsh-finance/finance
 */

/** Supported compounding frequencies. */
export type Compounding = 'daily' | 'monthly' | 'quarterly' | 'semiannually' | 'annually' | 'continuous'

/** Periods per year for the discrete frequencies. */
export const COMPOUNDING_PERIODS: Record<Exclude<Compounding, 'continuous'>, number> = {
  daily: 365,
  monthly: 12,
  quarterly: 4,
  semiannually: 2,
  annually: 1,
}

/** Hard cap for amortization schedule rows and yearly breakdown rows. */
export const MAX_SCHEDULE_ROWS = 360
export const MAX_BREAKDOWN_ROWS = 60

/** Validation failure — tools surface this as valid:false with a reason. */
export interface ValidationIssue {
  ok: false
  reason: string
}

/** Round to cents (2 dp) with an epsilon guard against float dust. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** Round to 6 dp for rate percentages. */
export function round6(value: number): number {
  return Math.round((value + Number.EPSILON) * 1e6) / 1e6
}

/** Validate shared loan inputs; returns a reason string or null when valid. */
export function validateLoanInput(
  principal: number,
  annualRatePercent: number,
  months: number,
  extraPerMonth: number,
): string | null {
  if (!Number.isFinite(principal) || principal <= 0) return 'principal must be a positive number'
  if (!Number.isFinite(annualRatePercent) || annualRatePercent <= -100) {
    return 'annual_rate_percent must be greater than -100'
  }
  if (!Number.isInteger(months) || months < 1 || months > 1200) {
    return 'months must be an integer between 1 and 1200'
  }
  if (!Number.isFinite(extraPerMonth) || extraPerMonth < 0) {
    return 'extra_principal_per_month must be a non-negative number'
  }
  return null
}

export interface LoanRow {
  month: number
  payment: number
  principal: number
  interest: number
  balance: number
}

export interface LoanResult {
  /** Contract monthly payment (rounded to cents). */
  monthlyPayment: number
  /** Total paid over the full term without extra payments. */
  totalPaid: number
  /** Total interest over the full term without extra payments. */
  totalInterest: number
  /** Actual months until payoff (fewer than `months` when extra payments apply). */
  payoffMonths: number
  /** Present only when extra payments shorten the term. */
  monthsSaved?: number
  interestSaved?: number
  /** Amortization rows (requested), capped at MAX_SCHEDULE_ROWS. */
  schedule?: LoanRow[]
  /** True when the schedule was capped before payoff. */
  truncated?: boolean
}

export interface ComputeLoanOptions {
  includeSchedule?: boolean
}

/**
 * Compute the fixed-rate loan plan.
 *
 * The contract payment is PMT = P·r·(1+r)^n / ((1+r)^n − 1) with the
 * zero-interest limit P/n. When extra principal is applied, the term shrinks:
 * the contract payment stays fixed and the final payment clears the balance.
 */
export function computeLoan(
  input: { principal: number; annualRatePercent: number; months: number; extraPerMonth?: number },
  options: ComputeLoanOptions = {},
): LoanResult | ValidationIssue {
  const extra = input.extraPerMonth ?? 0
  const invalid = validateLoanInput(input.principal, input.annualRatePercent, input.months, extra)
  if (invalid !== null) return { ok: false, reason: invalid }

  const { principal, months } = input
  const monthlyRate = input.annualRatePercent / 100 / 12

  let monthlyPayment: number
  if (monthlyRate === 0) {
    monthlyPayment = principal / months
  } else {
    const growth = Math.pow(1 + monthlyRate, months)
    monthlyPayment = (principal * monthlyRate * growth) / (growth - 1)
  }
  monthlyPayment = round2(monthlyPayment)

  const contractTotal = round2(monthlyPayment * months)
  const contractInterest = round2(contractTotal - principal)

  // Iterate the true amortization (full precision, final payment adjusted).
  const rows: LoanRow[] = []
  const maxRows = options.includeSchedule ? MAX_SCHEDULE_ROWS : months + 1
  let balance = principal
  let month = 0
  let interestSum = 0
  let totalPaid = 0
  let truncated = false

  while (balance > 0 && month < months) {
    month += 1
    const interest = balance * monthlyRate
    let pay = monthlyPayment + extra
    if (pay > balance + interest) pay = balance + interest // final partial payment
    const principalPaid = pay - interest
    balance = balance - principalPaid
    if (balance < 1e-9) balance = 0
    interestSum += interest
    totalPaid += pay
    if (options.includeSchedule && rows.length < maxRows) {
      rows.push({
        month,
        payment: round2(pay),
        principal: round2(principalPaid),
        interest: round2(interest),
        balance: round2(balance),
      })
    } else if (options.includeSchedule && rows.length >= maxRows) {
      truncated = true
    }
  }

  const result: LoanResult = {
    monthlyPayment,
    totalPaid: contractTotal,
    totalInterest: contractInterest,
    payoffMonths: month,
  }

  if (extra > 0) {
    const monthsSaved = months - month
    result.monthsSaved = monthsSaved
    result.interestSaved = round2(contractInterest - interestSum)
  }

  if (options.includeSchedule) {
    result.schedule = rows
    if (truncated) result.truncated = true
  }

  return result
}

/** Validate compound-growth inputs; returns a reason string or null. */
export function validateGrowthInput(
  principal: number,
  annualRatePercent: number,
  years: number,
  contributionPerMonth: number,
  compounding: Compounding,
): string | null {
  if (!Number.isFinite(principal) || principal <= 0) return 'principal must be a positive number'
  if (!Number.isFinite(annualRatePercent) || annualRatePercent <= -100) {
    return 'annual_rate_percent must be greater than -100'
  }
  if (!Number.isFinite(years) || years < 1 / 12 || years > 200) {
    return 'years must be between 1/12 and 200'
  }
  if (!Number.isFinite(contributionPerMonth) || contributionPerMonth < 0) {
    return 'contribution_per_month must be a non-negative number'
  }
  if (!(compounding in COMPOUNDING_PERIODS) && compounding !== 'continuous') {
    return `compounding must be one of: ${Object.keys(COMPOUNDING_PERIODS).join(', ')}, continuous`
  }
  return null
}

/** Effective monthly rate from an annual rate and a compounding frequency. */
export function monthlyRateFor(annualRatePercent: number, compounding: Compounding): number {
  const rate = annualRatePercent / 100
  if (compounding === 'continuous') return Math.exp(rate / 12) - 1
  const periods = COMPOUNDING_PERIODS[compounding]
  return Math.pow(1 + rate / periods, periods / 12) - 1
}

export interface GrowthRow {
  year: number
  balance: number
  contributions: number
  interest: number
}

export interface GrowthResult {
  months: number
  futureValue: number
  totalContributions: number
  interestEarned: number
  breakdown?: GrowthRow[]
}

export interface ComputeGrowthOptions {
  includeBreakdown?: boolean
}

/**
 * Future value of a lump sum plus monthly contributions (ordinary annuity,
 * contributions at the end of each month). The annual rate is first converted
 * to an effective monthly rate so any compounding frequency composes exactly.
 */
export function computeGrowth(
  input: {
    principal: number
    annualRatePercent: number
    years: number
    compounding: Compounding
    contributionPerMonth?: number
  },
  options: ComputeGrowthOptions = {},
): GrowthResult | ValidationIssue {
  const contribution = input.contributionPerMonth ?? 0
  const invalid = validateGrowthInput(
    input.principal,
    input.annualRatePercent,
    input.years,
    contribution,
    input.compounding,
  )
  if (invalid !== null) return { ok: false, reason: invalid }

  const months = Math.round(input.years * 12)
  const r = monthlyRateFor(input.annualRatePercent, input.compounding)
  const growth = Math.pow(1 + r, months)

  let futureValue: number
  if (r === 0) {
    futureValue = input.principal + contribution * months
  } else {
    futureValue = input.principal * growth + contribution * ((growth - 1) / r)
  }

  const totalContributions = input.principal + contribution * months

  const result: GrowthResult = {
    months,
    futureValue: round2(futureValue),
    totalContributions: round2(totalContributions),
    interestEarned: round2(futureValue - totalContributions),
  }

  if (options.includeBreakdown) {
    const rows: GrowthRow[] = []
    const cap = Math.min(MAX_BREAKDOWN_ROWS, Math.ceil(months / 12))
    let balance = input.principal
    let year = 0
    for (let block = 0; block < cap; block += 1) {
      const yearMonths = block + 1 === cap ? months - block * 12 : Math.min(12, months - block * 12)
      let contributed = 0
      for (let m = 0; m < yearMonths; m += 1) {
        balance = balance * (1 + r) + contribution
        contributed += contribution
      }
      year += 1
      rows.push({
        year,
        balance: round2(balance),
        contributions: round2(contributed),
        interest: round2(balance - (input.principal + contribution * (block * 12 + yearMonths))),
      })
    }
    result.breakdown = rows
  }

  return result
}

/** Effective annual rate (percent) from a nominal rate and period count. */
export function nominalToEffective(nominalPercent: number, periodsPerYear: number): number {
  const rate = nominalPercent / 100
  if (periodsPerYear <= 0) return Number.NaN
  return round6((Math.pow(1 + rate / periodsPerYear, periodsPerYear) - 1) * 100)
}

/** Nominal rate (percent) from an effective annual rate and period count. */
export function effectiveToNominal(effectivePercent: number, periodsPerYear: number): number {
  const rate = effectivePercent / 100
  if (periodsPerYear <= 0 || rate <= -1) return Number.NaN
  return round6(periodsPerYear * (Math.pow(1 + rate, 1 / periodsPerYear) - 1) * 100)
}

/** EAR (percent) for a continuously compounded nominal rate. */
export function continuousNominalToEffective(nominalPercent: number): number {
  return round6((Math.exp(nominalPercent / 100) - 1) * 100)
}

/** Continuously compounded nominal rate (percent) from an EAR. */
export function continuousEffectiveToNominal(effectivePercent: number): number {
  const rate = effectivePercent / 100
  if (rate <= -1) return Number.NaN
  return round6(Math.log(1 + rate) * 100)
}
