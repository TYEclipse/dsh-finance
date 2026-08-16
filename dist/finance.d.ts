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
export type Compounding = 'daily' | 'monthly' | 'quarterly' | 'semiannually' | 'annually' | 'continuous';
/** Periods per year for the discrete frequencies. */
export declare const COMPOUNDING_PERIODS: Record<Exclude<Compounding, 'continuous'>, number>;
/** Hard cap for amortization schedule rows and yearly breakdown rows. */
export declare const MAX_SCHEDULE_ROWS = 360;
export declare const MAX_BREAKDOWN_ROWS = 60;
/** Validation failure — tools surface this as valid:false with a reason. */
export interface ValidationIssue {
    ok: false;
    reason: string;
}
/** Round to cents (2 dp) with an epsilon guard against float dust. */
export declare function round2(value: number): number;
/** Round to 6 dp for rate percentages. */
export declare function round6(value: number): number;
/** Validate shared loan inputs; returns a reason string or null when valid. */
export declare function validateLoanInput(principal: number, annualRatePercent: number, months: number, extraPerMonth: number): string | null;
export interface LoanRow {
    month: number;
    payment: number;
    principal: number;
    interest: number;
    balance: number;
}
export interface LoanResult {
    /** Contract monthly payment (rounded to cents). */
    monthlyPayment: number;
    /** Total paid over the full term without extra payments. */
    totalPaid: number;
    /** Total interest over the full term without extra payments. */
    totalInterest: number;
    /** Actual months until payoff (fewer than `months` when extra payments apply). */
    payoffMonths: number;
    /** Present only when extra payments shorten the term. */
    monthsSaved?: number;
    interestSaved?: number;
    /** Amortization rows (requested), capped at MAX_SCHEDULE_ROWS. */
    schedule?: LoanRow[];
    /** True when the schedule was capped before payoff. */
    truncated?: boolean;
}
export interface ComputeLoanOptions {
    includeSchedule?: boolean;
}
/**
 * Compute the fixed-rate loan plan.
 *
 * The contract payment is PMT = P·r·(1+r)^n / ((1+r)^n − 1) with the
 * zero-interest limit P/n. When extra principal is applied, the term shrinks:
 * the contract payment stays fixed and the final payment clears the balance.
 */
export declare function computeLoan(input: {
    principal: number;
    annualRatePercent: number;
    months: number;
    extraPerMonth?: number;
}, options?: ComputeLoanOptions): LoanResult | ValidationIssue;
/** Validate compound-growth inputs; returns a reason string or null. */
export declare function validateGrowthInput(principal: number, annualRatePercent: number, years: number, contributionPerMonth: number, compounding: Compounding): string | null;
/** Effective monthly rate from an annual rate and a compounding frequency. */
export declare function monthlyRateFor(annualRatePercent: number, compounding: Compounding): number;
export interface GrowthRow {
    year: number;
    balance: number;
    contributions: number;
    interest: number;
}
export interface GrowthResult {
    months: number;
    futureValue: number;
    totalContributions: number;
    interestEarned: number;
    breakdown?: GrowthRow[];
}
export interface ComputeGrowthOptions {
    includeBreakdown?: boolean;
}
/**
 * Future value of a lump sum plus monthly contributions (ordinary annuity,
 * contributions at the end of each month). The annual rate is first converted
 * to an effective monthly rate so any compounding frequency composes exactly.
 */
export declare function computeGrowth(input: {
    principal: number;
    annualRatePercent: number;
    years: number;
    compounding: Compounding;
    contributionPerMonth?: number;
}, options?: ComputeGrowthOptions): GrowthResult | ValidationIssue;
/** Effective annual rate (percent) from a nominal rate and period count. */
export declare function nominalToEffective(nominalPercent: number, periodsPerYear: number): number;
/** Nominal rate (percent) from an effective annual rate and period count. */
export declare function effectiveToNominal(effectivePercent: number, periodsPerYear: number): number;
/** EAR (percent) for a continuously compounded nominal rate. */
export declare function continuousNominalToEffective(nominalPercent: number): number;
/** Continuously compounded nominal rate (percent) from an EAR. */
export declare function continuousEffectiveToNominal(effectivePercent: number): number;
//# sourceMappingURL=finance.d.ts.map