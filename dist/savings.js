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
import { round2 } from "./finance.js";
/** Iteration/term cap for the goal search (100 years). */
export const MAX_GOAL_MONTHS = 1200;
/** Effective monthly rate from an annual nominal percent. */
function monthlyRate(annualRatePercent) {
    return annualRatePercent / 100 / 12;
}
/**
 * Simulate month-end contributions until the balance reaches the target.
 * Returns the month count and the balance at that month, or null when the
 * target is not reached within {@link MAX_GOAL_MONTHS}.
 */
function simulateToTarget(target, current, rate, contribution) {
    let balance = current;
    for (let month = 1; month <= MAX_GOAL_MONTHS; month += 1) {
        balance = balance * (1 + rate) + contribution;
        if (balance >= target)
            return { months: month, balance };
    }
    return null;
}
/**
 * Goal-based saving: with a monthly contribution, find the month the target is
 * reached; with a deadline in months, find the contribution that gets there.
 */
export function computeSavingsGoal(input) {
    const { targetAmount, annualRatePercent } = input;
    const current = input.currentSavings ?? 0;
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
        return { ok: false, reason: 'target_amount must be a positive number' };
    }
    if (!Number.isFinite(annualRatePercent) || annualRatePercent <= -100) {
        return { ok: false, reason: 'annual_rate_percent must be greater than -100' };
    }
    if (!Number.isFinite(current) || current < 0) {
        return { ok: false, reason: 'current_savings must be a non-negative number' };
    }
    const contribution = input.monthlyContribution;
    if (contribution !== undefined && (!Number.isFinite(contribution) || contribution < 0)) {
        return { ok: false, reason: 'monthly_contribution must be a non-negative number' };
    }
    const months = input.months;
    if (months !== undefined && (!Number.isInteger(months) || months < 1 || months > MAX_GOAL_MONTHS)) {
        return { ok: false, reason: `months must be an integer between 1 and ${MAX_GOAL_MONTHS}` };
    }
    if (contribution === undefined && months === undefined) {
        return { ok: false, reason: 'provide monthly_contribution and/or months (at least one is required)' };
    }
    const rate = monthlyRate(annualRatePercent);
    const result = {
        targetAmount,
        currentSavings: current,
        annualRatePercent,
    };
    // ── mode A: how long until the target? ────────────────────────────────────
    if (contribution !== undefined) {
        result.monthlyContribution = contribution;
        if (current >= targetAmount) {
            result.monthsToGoal = 0;
            result.finalBalance = round2(current);
            result.totalContributions = round2(current);
            result.interestEarned = 0;
            result.alreadyReached = true;
        }
        else if (contribution === 0 && rate <= 0) {
            // No contribution and no growth: the gap never closes.
            result.unreachable = true;
        }
        else {
            const reached = simulateToTarget(targetAmount, current, rate, contribution);
            if (reached === null) {
                result.unreachable = true;
            }
            else {
                result.monthsToGoal = reached.months;
                result.finalBalance = round2(reached.balance);
                result.totalContributions = round2(current + contribution * reached.months);
                result.interestEarned = round2(reached.balance - (current + contribution * reached.months));
            }
        }
    }
    // ── mode B: what does the deadline require? ──────────────────────────────
    if (months !== undefined) {
        result.horizonMonths = months;
        const growth = Math.pow(1 + rate, months);
        const exact = rate === 0
            ? (targetAmount - current) / months
            : (targetAmount - current * growth) * rate / (growth - 1);
        const required = exact <= 0 ? 0 : Math.ceil(exact * 100 - 1e-9) / 100;
        result.requiredMonthlyContribution = required;
        // Simulate the cent-rounded payment so the projection matches a real plan.
        let balance = current;
        for (let month = 0; month < months; month += 1)
            balance = balance * (1 + rate) + required;
        result.projectedBalance = round2(balance);
        result.projectedInterest = round2(balance - (current + required * months));
    }
    // ── both modes: does the plan beat the deadline? ─────────────────────────
    if (contribution !== undefined && months !== undefined) {
        result.onTrack = result.unreachable !== true
            && result.monthsToGoal !== undefined
            && result.monthsToGoal <= months;
    }
    return result;
}
//# sourceMappingURL=savings.js.map