/**
 * Cash-flow analysis for dsh-finance — net present value, internal rate of
 * return (bisection over the discount-rate space) and payback periods for an
 * arbitrary series of cash flows. Pure arithmetic, deterministic, offline.
 *
 * Conventions: entry 0 is time 0 (typically the initial outlay, negative);
 * entry t is the flow at the end of period t. NPV discounts each entry by
 * (1 + r)^t. IRR solves NPV(r) = 0; it is undefined when flows never change
 * sign and may not be unique when they change sign more than once — both
 * cases are reported explicitly instead of fabricating a number.
 *
 * @module dsh-finance/cashflow
 */

import { round2, round6 } from './finance.ts'

/** Cash-flow analysis result; every field is present only when meaningful. */
export interface CashflowResult {
  /** Number of periods (entries − 1). */
  periods: number
  /** Sum of all positive entries (rounded to cents). */
  totalInflow: number
  /** Sum of all negative entries, sign-flipped (rounded to cents). */
  totalOutflow: number
  /** Sum of all entries (rounded to cents). */
  netCashflow: number
  /** Net present value at the discount rate (present only when a rate is given). */
  npv?: number
  /** IRR in percent (present only when flows change sign exactly once and a root exists). */
  irrPercent?: number
  /** True when flows change sign more than once (IRR may not be unique). */
  multipleIrrPossible?: boolean
  /** Human-readable explanation when IRR is absent or ambiguous. */
  irrNote?: string
  /** Undiscounted payback period with linear interpolation (present when cash flows cross zero). */
  paybackPeriods?: number
  /** Discounted payback period (present when a rate is given and discounted flows cross zero). */
  discountedPaybackPeriods?: number
}

/** Validation failure — tools surface this as valid:false with a reason. */
export interface CashflowIssue {
  ok: false
  reason: string
}

/** Round to 4 dp (payback periods). */
function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 1e4) / 1e4
}

/** NPV at a decimal rate: Σ cf_t / (1 + r)^t. */
export function npvAt(flows: number[], rate: number): number {
  let sum = 0
  for (let t = 0; t < flows.length; t += 1) {
    const flow = flows[t]
    if (flow === undefined) continue
    sum += flow / Math.pow(1 + rate, t)
  }
  return sum
}

/** Count sign transitions, ignoring zero entries. */
export function countSignChanges(flows: number[]): number {
  let changes = 0
  let previous = 0
  for (const flow of flows) {
    if (flow === 0) continue
    if (previous !== 0 && flow * previous < 0) changes += 1
    previous = flow
  }
  return changes
}

/**
 * Bisection search for the IRR (decimal rate) over (−99.9%, 1000%],
 * extending the top of the bracket ×10 up to 1,000,000% when needed.
 * Endpoint values may overflow to ±Infinity near r = −1; that is fine for
 * the straddle test because the sign is still exact. Returns null when no
 * bracket is found.
 */
export function findIrr(flows: number[]): number | null {
  const lo = -0.999
  let flo = npvAt(flows, lo)
  let hi = 10
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const fhi = npvAt(flows, hi)
    if (flo * fhi <= 0) {
      let a = lo
      let b = hi
      for (let i = 0; i < 300; i += 1) {
        const mid = (a + b) / 2
        if (mid === a || mid === b) break
        const fm = npvAt(flows, mid)
        if (fm === 0) return mid
        if (flo * fm <= 0) b = mid
        else {
          a = mid
          flo = fm
        }
      }
      return (a + b) / 2
    }
    hi *= 10
  }
  return null
}

/** Undiscounted payback with linear interpolation; null when flows never cross zero. */
export function simplePayback(flows: number[]): number | null {
  let cumulative = 0
  for (let t = 0; t < flows.length; t += 1) {
    const flow = flows[t]
    if (flow === undefined) continue
    const previous = cumulative
    cumulative += flow
    if (previous < 0 && cumulative >= 0) {
      return flow === 0 ? t : t - 1 + -previous / flow
    }
  }
  return null
}

/** Discounted payback with linear interpolation; null when flows never cross zero. */
export function discountedPayback(flows: number[], rate: number): number | null {
  let cumulative = 0
  for (let t = 0; t < flows.length; t += 1) {
    const flow = flows[t]
    if (flow === undefined) continue
    const discounted = flow / Math.pow(1 + rate, t)
    const previous = cumulative
    cumulative += discounted
    if (previous < 0 && cumulative >= 0) {
      return discounted === 0 ? t : t - 1 + -previous / discounted
    }
  }
  return null
}

/**
 * Analyze a cash-flow series: NPV at an optional discount rate, IRR
 * (with explicit no-root / multiple-root reporting) and payback periods.
 */
export function analyzeCashflows(
  flows: number[],
  discountRatePercent?: number,
): CashflowResult | CashflowIssue {
  if (!Array.isArray(flows)) return { ok: false, reason: 'cash_flows must be an array of numbers' }
  if (flows.length < 2) return { ok: false, reason: 'cash_flows must contain at least 2 entries (initial outlay + one inflow)' }
  if (flows.length > 1200) return { ok: false, reason: 'cash_flows is capped at 1200 entries' }
  for (const flow of flows) {
    if (typeof flow !== 'number' || !Number.isFinite(flow)) {
      return { ok: false, reason: 'cash_flows entries must be finite numbers' }
    }
  }
  if (discountRatePercent !== undefined
    && (typeof discountRatePercent !== 'number' || !Number.isFinite(discountRatePercent) || discountRatePercent <= -100)) {
    return { ok: false, reason: 'discount_rate_percent must be a finite number greater than -100' }
  }

  const result: CashflowResult = {
    periods: flows.length - 1,
    totalInflow: round2(flows.filter((flow) => flow > 0).reduce((sum, flow) => sum + flow, 0)),
    totalOutflow: round2(-flows.filter((flow) => flow < 0).reduce((sum, flow) => sum + flow, 0)),
    netCashflow: round2(flows.reduce((sum, flow) => sum + flow, 0)),
  }

  if (discountRatePercent !== undefined) {
    result.npv = round2(npvAt(flows, discountRatePercent / 100))
  }

  const changes = countSignChanges(flows)
  if (changes === 0) {
    result.irrNote = 'no sign change in cash flows — IRR is undefined'
  } else if (changes > 1) {
    result.multipleIrrPossible = true
    result.irrNote = 'cash flows change sign more than once — IRR may not be unique'
  } else {
    const irr = findIrr(flows)
    if (irr !== null) result.irrPercent = round6(irr * 100)
    else result.irrNote = 'no IRR found within -100% to 1000000%'
  }

  const payback = simplePayback(flows)
  if (payback !== null) result.paybackPeriods = round4(payback)

  if (discountRatePercent !== undefined) {
    const discounted = discountedPayback(flows, discountRatePercent / 100)
    if (discounted !== null) result.discountedPaybackPeriods = round4(discounted)
  }

  return result
}
