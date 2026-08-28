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
/** Cash-flow analysis result; every field is present only when meaningful. */
export interface CashflowResult {
    /** Number of periods (entries − 1). */
    periods: number;
    /** Sum of all positive entries (rounded to cents). */
    totalInflow: number;
    /** Sum of all negative entries, sign-flipped (rounded to cents). */
    totalOutflow: number;
    /** Sum of all entries (rounded to cents). */
    netCashflow: number;
    /** Net present value at the discount rate (present only when a rate is given). */
    npv?: number;
    /** IRR in percent (present only when flows change sign exactly once and a root exists). */
    irrPercent?: number;
    /** True when flows change sign more than once (IRR may not be unique). */
    multipleIrrPossible?: boolean;
    /** Human-readable explanation when IRR is absent or ambiguous. */
    irrNote?: string;
    /** Undiscounted payback period with linear interpolation (present when cash flows cross zero). */
    paybackPeriods?: number;
    /** Discounted payback period (present when a rate is given and discounted flows cross zero). */
    discountedPaybackPeriods?: number;
}
/** Validation failure — tools surface this as valid:false with a reason. */
export interface CashflowIssue {
    ok: false;
    reason: string;
}
/** NPV at a decimal rate: Σ cf_t / (1 + r)^t. */
export declare function npvAt(flows: number[], rate: number): number;
/** Count sign transitions, ignoring zero entries. */
export declare function countSignChanges(flows: number[]): number;
/**
 * Bisection search for the IRR (decimal rate) over (−99.9%, 1000%],
 * extending the top of the bracket ×10 up to 1,000,000% when needed.
 * Endpoint values may overflow to ±Infinity near r = −1; that is fine for
 * the straddle test because the sign is still exact. Returns null when no
 * bracket is found.
 */
export declare function findIrr(flows: number[]): number | null;
/** Undiscounted payback with linear interpolation; null when flows never cross zero. */
export declare function simplePayback(flows: number[]): number | null;
/** Discounted payback with linear interpolation; null when flows never cross zero. */
export declare function discountedPayback(flows: number[], rate: number): number | null;
/**
 * Analyze a cash-flow series: NPV at an optional discount rate, IRR
 * (with explicit no-root / multiple-root reporting) and payback periods.
 */
export declare function analyzeCashflows(flows: number[], discountRatePercent?: number): CashflowResult | CashflowIssue;
//# sourceMappingURL=cashflow.d.ts.map