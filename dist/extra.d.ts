/**
 * Extra-payment scenario for dsh-finance — what one discretionary monthly
 * amount does when it goes at an existing fixed-rate loan instead of into an
 * investment. Pure arithmetic, deterministic, offline.
 *
 * Conventions match the rest of the plugin: the contract payment is rounded to
 * cents once (it is the number printed on the statement), balances are carried
 * at full precision inside the loop, the last payment is capped at
 * `balance + interest` so the loan clears exactly, and money is rounded only at
 * the output boundary.
 *
 * The comparison is deliberately not a forecast. Prepaying has a *known*
 * return: it saves interest at exactly the loan rate, every month, guaranteed.
 * Investing has an *expected* return, and we refuse to invent one — when the
 * caller does not supply an invest rate, the investing block and the verdict
 * are absent rather than filled with a default assumption.
 *
 * When a rate is supplied, both sides are compared on the same monthly budget
 * over the same horizon (the month the loan would have been paid off anyway):
 * whatever the loan does not require that month is invested at the given rate.
 * At an investment rate equal to the loan rate the two are identical by
 * construction (no-arbitrage), which the oracle self-check pins down.
 *
 * @module dsh-finance/extra
 */
/** Upper bound on the remaining term accepted by the scenario. */
export declare const MAX_EXTRA_MONTHS = 1200;
/** Validation failure — tools surface this as valid:false with a reason. */
export interface ExtraIssue {
    ok: false;
    reason: string;
}
export interface ExtraScenarioInput {
    balance: number;
    annualRatePercent: number;
    remainingMonths: number;
    extraPayment: number;
    investRatePercent?: number;
}
export interface InstallmentTotals {
    /** Month the balance reached zero (1-based). */
    months: number;
    /** Interest actually paid over the life of the loan. */
    totalInterest: number;
    /** Everything paid to the lender, principal + interest. */
    totalPaid: number;
}
export interface ExtraInvestComparison {
    ratePercent: number;
    /** Month the baseline loan would have been paid off; both sides stop here. */
    horizonMonths: number;
    /** What would have been contributed to the investment (extra × horizon). */
    contributions: number;
    /** Value of investing the extra amount every month to the horizon. */
    value: number;
    /** Value of the cash freed by the shorter loan, invested at the same rate. */
    prepayValue: number;
    /** prepayValue − value: positive means prepaying leaves you ahead. */
    difference: number;
}
export interface ExtraScenarioResult {
    balance: number;
    annualRatePercent: number;
    remainingMonths: number;
    extraPayment: number;
    /** Contract monthly payment (rounded to cents), unchanged by the extra amount. */
    monthlyPayment: number;
    /** The loan as it stands, paying only the contract payment. */
    baseline: InstallmentTotals;
    /** The same loan with the extra amount applied every month. */
    withExtra: InstallmentTotals & {
        /** How much of `totalPaid` was the discretionary extra. */
        extraPaid: number;
    };
    monthsSaved: number;
    interestSaved: number;
    /** The loan rate — the guaranteed return of prepaying, in percent. */
    guaranteedReturnPercent: number;
    /** Present only when an invest rate was supplied. */
    investing?: ExtraInvestComparison;
    /** Present only when an invest rate was supplied. */
    verdict?: 'prepay_wins' | 'invest_wins' | 'tie';
    note: string;
}
/** Validate the scenario inputs; returns a reason string or null when valid. */
export declare function validateExtraInput(balance: number, annualRatePercent: number, remainingMonths: number, extraPayment: number, investRatePercent?: number): string | null;
/**
 * What one extra monthly payment does: months and interest saved, plus — only
 * when an investment rate is supplied — a like-for-like terminal comparison of
 * prepaying against investing the same money.
 */
export declare function computeExtraScenario(input: ExtraScenarioInput): ExtraScenarioResult | ExtraIssue;
//# sourceMappingURL=extra.d.ts.map