/**
 * Goal-based saving math for dsh-finance — the two questions every savings
 * plan asks: when will I get there, and what do I have to put in each month
 * to get there in time. Pure arithmetic, deterministic, offline.
 *
 * Conventions match the rest of the plugin: the annual rate is compounded
 * monthly (rate/12), contributions are made at the end of each month, and
 * amounts are rounded to cents only at the output boundary. The
 * `required_monthly_contribution` in the deadline mode is rounded *up* to the
 * cent so a plan built from it actually reaches the target; the reported
 * `projected_balance` simulates that same cent-rounded payment, so the pair
 * is internally consistent (bank behaviour, cf. retirement.ts).
 *
 * @module dsh-finance/savings
 */
/** Iteration/term cap for the goal search (100 years). */
export declare const MAX_GOAL_MONTHS = 1200;
/** Validation failure — tools surface this as valid:false with a reason. */
export interface SavingsIssue {
    ok: false;
    reason: string;
}
/** Savings plan result; every optional field is present only when meaningful. */
export interface SavingsGoalResult {
    targetAmount: number;
    currentSavings: number;
    annualRatePercent: number;
    /** Echoed monthly contribution (present when one was given). */
    monthlyContribution?: number;
    /** Months until the balance first reaches the target (present with a contribution). */
    monthsToGoal?: number;
    /** Balance at the end of that month (present with a contribution). */
    finalBalance?: number;
    /** Everything paid in = current savings + contributions made (present with a contribution). */
    totalContributions?: number;
    /** final balance − total contributions (negative when the plan loses money). */
    interestEarned?: number;
    /** True when the balance already meets the target at month zero (present with a contribution). */
    alreadyReached?: boolean;
    /** True when no contribution/return path reaches the target within 100 years. */
    unreachable?: boolean;
    /** Cent-rounded-up monthly contribution that reaches the target in the horizon (present with months). */
    requiredMonthlyContribution?: number;
    /** Requested horizon in months (present with years… i.e. with `months`). */
    horizonMonths?: number;
    /** Balance at the end of the horizon when paying the required contribution (present with months). */
    projectedBalance?: number;
    /** project balance − (current savings + contributions paid) (present with months). */
    projectedInterest?: number;
    /** True when the given contribution reaches the target within the given horizon (present when both are given). */
    onTrack?: boolean;
}
/**
 * Goal-based saving: with a monthly contribution, find the month the target is
 * reached; with a deadline in months, find the contribution that gets there.
 */
export declare function computeSavingsGoal(input: {
    targetAmount: number;
    annualRatePercent: number;
    currentSavings?: number;
    monthlyContribution?: number;
    months?: number;
}): SavingsGoalResult | SavingsIssue;
//# sourceMappingURL=savings.d.ts.map