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
import { round2, round6 } from "./finance.js";
/**
 * Plan retirement withdrawals: with a monthly withdrawal, compute time to
 * exhaustion (or report it never exhausts); with a horizon in years, compute
 * the sustainable monthly withdrawal. With both, additionally report whether
 * the withdrawal lasts the horizon.
 */
export function planRetirement(input) {
    const { principal, annualRatePercent } = input;
    if (!Number.isFinite(principal) || principal <= 0) {
        return { ok: false, reason: 'principal must be a positive number' };
    }
    if (!Number.isFinite(annualRatePercent) || annualRatePercent <= -100) {
        return { ok: false, reason: 'annual_rate_percent must be greater than -100' };
    }
    const withdrawal = input.monthlyWithdrawal;
    if (withdrawal !== undefined && (!Number.isFinite(withdrawal) || withdrawal <= 0)) {
        return { ok: false, reason: 'monthly_withdrawal must be a positive number' };
    }
    const years = input.years;
    if (years !== undefined && (!Number.isFinite(years) || years < 1 / 12 || years > 200)) {
        return { ok: false, reason: 'years must be between 1/12 and 200' };
    }
    if (withdrawal === undefined && years === undefined) {
        return { ok: false, reason: 'provide monthly_withdrawal and/or years (at least one is required)' };
    }
    const monthlyRate = annualRatePercent / 100 / 12;
    const result = { principal, annualRatePercent };
    if (withdrawal !== undefined) {
        result.monthlyWithdrawal = withdrawal;
        result.withdrawalRatePercent = round6((withdrawal * 12 / principal) * 100);
        if (monthlyRate === 0) {
            const months = principal / withdrawal;
            result.monthsToExhaust = round2(months);
            result.yearsToExhaust = round2(months / 12);
        }
        else if (withdrawal <= principal * monthlyRate) {
            result.neverExhausts = true;
        }
        else {
            const months = Math.log(withdrawal / (withdrawal - principal * monthlyRate)) / Math.log(1 + monthlyRate);
            result.monthsToExhaust = round2(months);
            result.yearsToExhaust = round2(months / 12);
        }
        if (years !== undefined) {
            const months = result.monthsToExhaust;
            result.lastsHorizon = result.neverExhausts === true || (months !== undefined && months >= years * 12);
        }
    }
    if (years !== undefined) {
        const months = Math.round(years * 12);
        let sustainable;
        if (monthlyRate === 0) {
            sustainable = principal / months;
        }
        else {
            const growth = Math.pow(1 + monthlyRate, months);
            sustainable = (principal * monthlyRate * growth) / (growth - 1);
        }
        result.horizonMonths = months;
        result.horizonYears = years;
        // Bank behavior (R9): amortize with the cent-rounded payment, not the
        // full-precision one, so totals match what a real account would show.
        const rounded = round2(sustainable);
        result.sustainableMonthlyWithdrawal = rounded;
        result.totalWithdrawn = round2(rounded * months);
        result.interestEarned = round2(rounded * months - principal);
    }
    return result;
}
//# sourceMappingURL=retirement.js.map