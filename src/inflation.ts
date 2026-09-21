/**
 * Purchasing-power math for dsh-finance — what inflation does to an amount
 * over time, and what a nominal return really earns once inflation is taken
 * out. Pure arithmetic, deterministic, offline.
 *
 * Conventions: inflation compounds annually at the stated rate; `years` may
 * be fractional (months = round(years·12) is echoed for reference, the
 * exponent stays fractional so the number matches the stated horizon). The
 * real rate uses the exact Fisher relation (1+nominal)/(1+inflation) − 1,
 * kept at full precision internally and rounded only at the output boundary —
 * the real future value is compounded with that unrounded rate, never with
 * the rounded percent shown in the output.
 *
 * @module dsh-finance/inflation
 */

import { round2, round6 } from './finance.ts'

/** Validation failure — tools surface this as valid:false with a reason. */
export interface InflationIssue {
  ok: false
  reason: string
}

/** Inflation adjustment result; the nominal-return fields need `nominalRatePercent`. */
export interface InflationResult {
  amount: number
  annualInflationPercent: number
  years: number
  /** Whole months in the horizon (reference echo; the exponent stays fractional). */
  months: number
  /** What `amount` of today's money has to pay for the same thing after the horizon. */
  futureCost: number
  /** What a nominal `amount` received after the horizon is worth in today's money. */
  realValue: number
  /** Echoed nominal return (present only when one was given). */
  nominalRatePercent?: number
  /** Inflation-adjusted return: (1+nominal)/(1+inflation) − 1, in percent. */
  realRatePercent?: number
  /** Nominal value after the horizon at the nominal return. */
  nominalFutureValue?: number
  /** Same investment expressed in today's purchasing power. */
  realFutureValue?: number
}

/**
 * Adjust an amount for inflation: cost of the same goods in the future,
 * present value of a future nominal amount, and — when a nominal return is
 * given — the real (inflation-adjusted) return and the real future value.
 */
export function computeInflation(input: {
  amount: number
  annualInflationPercent: number
  years: number
  nominalRatePercent?: number
}): InflationResult | InflationIssue {
  const { amount, annualInflationPercent, years } = input

  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, reason: 'amount must be a non-negative number' }
  }
  if (!Number.isFinite(annualInflationPercent) || annualInflationPercent <= -100) {
    return { ok: false, reason: 'annual_inflation_percent must be greater than -100' }
  }
  if (!Number.isFinite(years) || years < 1 / 12 || years > 200) {
    return { ok: false, reason: 'years must be between 1/12 and 200' }
  }
  const nominal = input.nominalRatePercent
  if (nominal !== undefined && (!Number.isFinite(nominal) || nominal <= -100)) {
    return { ok: false, reason: 'nominal_rate_percent must be greater than -100' }
  }

  const inflation = annualInflationPercent / 100
  const deflator = Math.pow(1 + inflation, years)

  const result: InflationResult = {
    amount,
    annualInflationPercent,
    years,
    months: Math.round(years * 12),
    futureCost: round2(amount * deflator),
    realValue: round2(amount / deflator),
  }

  if (nominal !== undefined) {
    const nominalRate = nominal / 100
    const realRate = (1 + nominalRate) / (1 + inflation) - 1
    result.nominalRatePercent = nominal
    result.realRatePercent = round6(realRate * 100)
    result.nominalFutureValue = round2(amount * Math.pow(1 + nominalRate, years))
    result.realFutureValue = round2(amount * Math.pow(1 + realRate, years))
  }

  return result
}
