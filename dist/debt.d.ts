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
/** Upper bound on the number of debts in one plan. */
export declare const MAX_DEBTS = 10;
/** Iteration cap (100 years) before a plan is declared endless. */
export declare const MAX_PAYOFF_MONTHS = 1200;
/** Payoff strategies: highest rate first, or smallest balance first. */
export type DebtStrategy = 'avalanche' | 'snowball';
/** One debt in the plan, as given. */
export interface DebtInput {
    name?: string;
    balance: number;
    annualRatePercent: number;
    minimumPayment: number;
}
/** Validation failure — tools surface this as valid:false with a reason. */
export interface DebtIssue {
    ok: false;
    reason: string;
}
/** Per-debt payoff record. */
export interface DebtPayoffRow {
    name: string;
    /** Month the balance reached zero (1-based). */
    clearedMonth: number;
    /** Interest paid on this debt over its life (rounded to cents). */
    interestPaid: number;
    /** Everything paid towards this debt, principal + interest (rounded to cents). */
    paid: number;
}
/** Outcome of one strategy over the whole plan. */
export interface DebtStrategyOutcome {
    strategy: DebtStrategy;
    debtFree: boolean;
    monthsToDebtFree?: number;
    totalPaid?: number;
    totalInterest?: number;
    payoffOrder: DebtPayoffRow[];
}
/** Full payoff plan result; optional fields are present only when meaningful. */
export interface DebtPayoffResult {
    monthlyBudget: number;
    debtCount: number;
    totalBalance: number;
    totalMinimums: number;
    /** Budget left over after every minimum payment (rounded to cents). */
    extraPerMonth: number;
    strategy: DebtStrategy;
    /** Order the leftover budget attacks debts in (strategy priority, month 1). */
    priorityOrder: string[];
    debtFree: boolean;
    monthsToDebtFree?: number;
    totalPaid?: number;
    totalInterest?: number;
    payoffOrder: DebtPayoffRow[];
    comparison: Array<{
        strategy: DebtStrategy;
        debtFree: boolean;
        monthsToDebtFree?: number;
        totalInterest?: number;
    }>;
    bestStrategy?: DebtStrategy | 'tie';
    interestSavedByBest?: number;
    monthsSavedByBest?: number;
    note?: string;
}
/**
 * Plan the payoff of several debts against one monthly budget, for the
 * requested strategy and for both strategies side by side (so the
 * avalanche-vs-snowball difference is a number, not a slogan).
 */
export declare function computeDebtPayoff(input: {
    debts: DebtInput[];
    monthlyBudget: number;
    strategy?: DebtStrategy;
}): DebtPayoffResult | DebtIssue;
//# sourceMappingURL=debt.d.ts.map