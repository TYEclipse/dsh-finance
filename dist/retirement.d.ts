/**
 * Retirement / withdrawal planning for dsh-finance — the safe-withdrawal
 * family of questions answered exactly: how long does the money last, and
 * how much can be withdrawn sustainably. Pure arithmetic, deterministic,
 * offline.
 *
 * Conventions: the expected annual return is compounded monthly (rate/12);
 * withdrawals happen at the end of each month. Time to exhaustion solves
 * B_n = P(1+r)^n − W·((1+r)^n − 1)/r = 0 for n; when the withdrawal is at
 * or below interest-only (W ≤ P·r) the balance never depletes. The
 * sustainable withdrawal for a horizon is the PMT formula (the same
 * closed form as loan_payment), so the two tools cross-check each other.
 *
 * @module dsh-finance/retirement
 */
/** Retirement plan result; every field is present only when meaningful. */
export interface RetirementResult {
    principal: number;
    annualRatePercent: number;
    /** Echoed monthly withdrawal (present when one was given). */
    monthlyWithdrawal?: number;
    /** Annual withdrawal as a percent of principal — the classic withdrawal rate. */
    withdrawalRatePercent?: number;
    /** Months until the balance hits zero (present when a withdrawal exhausts it). */
    monthsToExhaust?: number;
    /** Years until the balance hits zero (present when a withdrawal exhausts it). */
    yearsToExhaust?: number;
    /** True when the withdrawal is at or below interest-only and never depletes. */
    neverExhausts?: boolean;
    /** Monthly withdrawal that exhausts the balance exactly at the horizon (present when years given). */
    sustainableMonthlyWithdrawal?: number;
    /** Horizon in months (present when years given). */
    horizonMonths?: number;
    /** Horizon in years (echoed; present when years given). */
    horizonYears?: number;
    /** Total withdrawn over the horizon (present when years given). */
    totalWithdrawn?: number;
    /** Interest earned over the horizon = total withdrawn − principal. */
    interestEarned?: number;
    /** True when the given withdrawal survives the given horizon (present when both are given). */
    lastsHorizon?: boolean;
}
/** Validation failure — tools surface this as valid:false with a reason. */
export interface RetirementIssue {
    ok: false;
    reason: string;
}
/**
 * Plan retirement withdrawals: with a monthly withdrawal, compute time to
 * exhaustion (or report it never exhausts); with a horizon in years, compute
 * the sustainable monthly withdrawal. With both, additionally report whether
 * the withdrawal lasts the horizon.
 */
export declare function planRetirement(input: {
    principal: number;
    annualRatePercent: number;
    monthlyWithdrawal?: number;
    years?: number;
}): RetirementResult | RetirementIssue;
//# sourceMappingURL=retirement.d.ts.map