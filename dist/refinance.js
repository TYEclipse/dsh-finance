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
import { computeLoan, round2 } from "./finance.js";
/** Upper bound on either loan term, in months (100 years). */
export const MAX_REFINANCE_MONTHS = 1200;
/** Round money and fold -0 into 0 (JSON.stringify(-0) === "0", R66 anchor). */
function roundMoney(value) {
    const rounded = round2(value);
    return rounded === 0 ? 0 : rounded;
}
/** Monthly rate as a fraction (annual percent / 12). */
function monthlyRate(annualRatePercent) {
    return annualRatePercent / 100 / 12;
}
/**
 * Balance left after `months` payments of exactly `payment`, from the closed
 * form B = P·(1+r)^m − PMT·((1+r)^m − 1)/r.
 *
 * Deliberately **not** clamped at zero: a payment rounded up clears the loan a
 * hair early, and that negative remainder is exactly the final overpayment —
 * subtracting it is what makes the horizon interest the amount the borrower
 * actually pays rather than `payment × months − principal` (F4/F5 caught the
 * difference: 67,047.60 vs 67,046.66).
 */
function balanceAfter(principal, rate, payment, months) {
    if (months <= 0)
        return principal;
    if (rate === 0)
        return principal - payment * months;
    const growth = Math.pow(1 + rate, months);
    return principal * growth - payment * ((growth - 1) / rate);
}
/**
 * Interest paid over the first `months` payments: everything paid minus the
 * principal retired. Derived from the closed-form balance so it uses the same
 * contract payment the totals use (no second amortisation loop).
 */
function interestThrough(principal, rate, payment, months) {
    const retired = principal - balanceAfter(principal, rate, payment, months);
    return Math.max(0, payment * months - retired);
}
/** Pull the contract figures out of a `computeLoan` result. */
function sideOf(result) {
    return {
        monthlyPayment: result.monthlyPayment,
        totalInterest: result.totalInterest,
        totalPaid: result.totalPaid,
    };
}
/** Integer month count in range, or null when the value is not acceptable. */
function monthCount(value) {
    return Number.isInteger(value) && value >= 1 && value <= MAX_REFINANCE_MONTHS;
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
export function analyzeRefinance(input) {
    const { balance, currentRatePercent, newRatePercent } = input;
    const remainingMonths = input.remainingMonths;
    const newTermMonths = input.newTermMonths ?? remainingMonths;
    const closingCosts = input.closingCosts ?? 0;
    const rollCostsIn = input.rollCostsIn ?? false;
    if (!Number.isFinite(balance) || balance <= 0) {
        return { ok: false, reason: 'balance must be a positive number' };
    }
    if (!Number.isFinite(currentRatePercent) || currentRatePercent <= -100) {
        return { ok: false, reason: 'current_rate_percent must be greater than -100' };
    }
    if (!monthCount(remainingMonths)) {
        return { ok: false, reason: `remaining_months must be an integer between 1 and ${MAX_REFINANCE_MONTHS}` };
    }
    if (!Number.isFinite(newRatePercent) || newRatePercent <= -100) {
        return { ok: false, reason: 'new_rate_percent must be greater than -100' };
    }
    if (!monthCount(newTermMonths)) {
        return { ok: false, reason: `new_term_months must be an integer between 1 and ${MAX_REFINANCE_MONTHS}` };
    }
    if (!Number.isFinite(closingCosts) || closingCosts < 0) {
        return { ok: false, reason: 'closing_costs must be a non-negative number' };
    }
    const requestedHorizon = input.horizonMonths;
    if (requestedHorizon !== undefined && !monthCount(requestedHorizon)) {
        return { ok: false, reason: `horizon_months must be an integer between 1 and ${MAX_REFINANCE_MONTHS}` };
    }
    const currentLoan = computeLoan({
        principal: balance,
        annualRatePercent: currentRatePercent,
        months: remainingMonths,
    });
    const amountFinanced = round2(rollCostsIn ? balance + closingCosts : balance);
    const newLoan = computeLoan({
        principal: amountFinanced,
        annualRatePercent: newRatePercent,
        months: newTermMonths,
    });
    const current = sideOf(currentLoan);
    const refinanced = { ...sideOf(newLoan), amountFinanced };
    const monthlySavings = roundMoney(current.monthlyPayment - refinanced.monthlyPayment);
    const upfrontCash = roundMoney(rollCostsIn ? 0 : closingCosts);
    const lifetimeInterestSaved = roundMoney(current.totalInterest - refinanced.totalInterest);
    const horizonMonths = Math.min(requestedHorizon ?? Math.min(remainingMonths, newTermMonths), remainingMonths, newTermMonths);
    const currentInterest = roundMoney(interestThrough(balance, monthlyRate(currentRatePercent), current.monthlyPayment, horizonMonths));
    const refinancedInterest = roundMoney(interestThrough(amountFinanced, monthlyRate(newRatePercent), refinanced.monthlyPayment, horizonMonths));
    const interestSaved = roundMoney(currentInterest - refinancedInterest);
    const cashSaved = roundMoney(monthlySavings * horizonMonths - upfrontCash);
    let breakEvenMonth;
    if (monthlySavings > 0) {
        breakEvenMonth = upfrontCash > 0 ? Math.ceil((upfrontCash - 1e-9) / monthlySavings) : 1;
    }
    let verdict;
    if (monthlySavings > 0 && interestSaved > 0)
        verdict = 'cheaper-every-way';
    else if (monthlySavings > 0)
        verdict = 'payment-down-interest-up';
    else if (interestSaved > 0)
        verdict = 'payment-up-interest-down';
    else
        verdict = 'not-better';
    const notes = [];
    if (newTermMonths > remainingMonths) {
        notes.push('the new term is longer — a smaller payment can still cost more interest over the life of the loan');
    }
    else if (newTermMonths < remainingMonths) {
        notes.push('the new term is shorter — the payment can rise even at a lower rate; compare the interest, not the payment');
    }
    if (breakEvenMonth === undefined) {
        notes.push('no break-even: the new payment is not lower than the current one');
    }
    else if (breakEvenMonth > horizonMonths) {
        notes.push(`break-even falls after the ${horizonMonths}-month horizon you asked about`);
    }
    if (rollCostsIn && closingCosts > 0) {
        notes.push('closing costs are financed into the new balance: no cash at closing, but more principal borrowed');
    }
    if (Math.abs(lifetimeInterestSaved - interestSaved) > 0.05 && horizonMonths === remainingMonths && horizonMonths === newTermMonths) {
        notes.push('lifetime_interest_saved comes from the reported contract totals while horizon.interest_saved comes from the amortisation — they differ by cents when a rounded payment leaves a residual');
    }
    const result = {
        balance: roundMoney(balance),
        currentRatePercent,
        remainingMonths,
        newRatePercent,
        newTermMonths,
        closingCosts: roundMoney(closingCosts),
        rollCostsIn,
        current,
        refinanced,
        monthlySavings,
        upfrontCash,
        lifetimeInterestSaved,
        horizonMonths,
        horizon: { currentInterest, refinancedInterest, interestSaved, cashSaved },
        verdict,
    };
    if (breakEvenMonth !== undefined) {
        result.breakEvenMonth = breakEvenMonth;
        result.breakEvenWithinHorizon = breakEvenMonth <= horizonMonths;
    }
    if (notes.length > 0)
        result.note = notes.join('; ');
    return result;
}
//# sourceMappingURL=refinance.js.map