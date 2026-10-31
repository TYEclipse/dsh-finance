/**
 * Refinance analysis for dsh-finance — is replacing one fixed-rate loan with
 * another worth it? Pure arithmetic, deterministic, offline.
 *
 * The two ways people answer this question disagree, and both are right:
 *
 *   - **payment view** — the monthly bill falls (or rises), and the closing
 *     costs have to be bought back out of that difference;
 *   - **interest view** — the total interest over the life of the loan falls
 *     (or rises), which is what stretching a term trade
 *     "lower payment" for.
 *
 * So this module reports both and refuses to collapse them into one boolean:
 * `verdict` is one of `cheaper-every-way`, `payment-down-interest-up`,
 * `payment-up-interest-down`, `not-better`, and a `note` explains which
 * assumption is driving it. Conventions match the rest of the plugin: monthly
 * compounding at rate/12, the contract payment rounded to cents once, amounts
 * rounded to cents only at the output boundary, and balances carried at full
 * precision inside the arithmetic.
 *
 * Honesty rules worth keeping: a loan whose payment is not lowered has **no**
 * break-even month (`break_even_month` is omitted, not reported as a huge
 * number); the break-even month is measured against cash paid at closing, so
 * financing the closing costs into the balance moves that cost into the
 * payment instead; and the horizon interest comes from the amortisation while
 * `lifetime_interest_saved` comes from the reported contract totals — the two
 * can differ by a few cents because a payment rounded down leaves a residual
 * balance in the final month.
 *
 * @module dsh-finance/refinance
 */
/** Upper bound on either loan term, in months (100 years). */
export declare const MAX_REFINANCE_MONTHS = 1200;
/** Validation failure — tools surface this as valid:false with a reason. */
export interface RefinanceIssue {
    ok: false;
    reason: string;
}
/** One side of the comparison, as displayed. */
export interface RefinanceSide {
    monthlyPayment: number;
    totalInterest: number;
    totalPaid: number;
}
/** What the reader is told to conclude, from the two views. */
export type RefinanceVerdict = 'cheaper-every-way' | 'payment-down-interest-up' | 'payment-up-interest-down' | 'not-better';
/** Full refinance comparison. Optional fields are present only when meaningful. */
export interface RefinanceResult {
    balance: number;
    currentRatePercent: number;
    remainingMonths: number;
    newRatePercent: number;
    newTermMonths: number;
    closingCosts: number;
    rollCostsIn: boolean;
    current: RefinanceSide;
    refinanced: RefinanceSide & {
        amountFinanced: number;
    };
    /** current payment − refinanced payment; negative means the bill goes up. */
    monthlySavings: number;
    /** Cash paid at closing (0 when the costs are financed). */
    upfrontCash: number;
    /** Contract-total interest difference over the two full terms. */
    lifetimeInterestSaved: number;
    /** Months actually compared (never longer than either remaining term). */
    horizonMonths: number;
    horizon: {
        currentInterest: number;
        refinancedInterest: number;
        interestSaved: number;
        cashSaved: number;
    };
    /** Months until payment savings repay the cash at closing; absent when none. */
    breakEvenMonth?: number;
    /** Whether the break-even falls inside the comparison horizon. */
    breakEvenWithinHorizon?: boolean;
    verdict: RefinanceVerdict;
    note?: string;
}
/**
 * Compare keeping the current loan against refinancing it.
 *
 * `new_term_months` defaults to the remaining term (an apples-to-apples rate
 * change); `closing_costs` are cash at closing unless `roll_costs_in` is set,
 * in which case they are added to the financed balance; `horizon_months`
 * defaults to the shorter of the two terms and is how long the comparison is
 * assumed to run.
 */
export declare function analyzeRefinance(input: {
    balance: number;
    currentRatePercent: number;
    remainingMonths: number;
    newRatePercent: number;
    newTermMonths?: number;
    closingCosts?: number;
    rollCostsIn?: boolean;
    horizonMonths?: number;
}): RefinanceResult | RefinanceIssue;
//# sourceMappingURL=refinance.d.ts.map