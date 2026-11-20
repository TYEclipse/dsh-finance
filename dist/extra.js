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
import { round2 } from "./finance.js";
/** Upper bound on the remaining term accepted by the scenario. */
export const MAX_EXTRA_MONTHS = 1200;
/** Balance below this is dust and snaps to zero. */
const ZERO_EPS = 1e-9;
/** Relative floor for calling the invest/prepay difference a tie (0.01%). */
const TIE_RELATIVE = 1e-4;
/** One cent of payment rounding, grown over the horizon, bounds the residual. */
const ROUNDING_CENT = 0.01;
/** Equal rates on both sides are a mathematical identity, not a rounding call. */
const RATE_EPS = 1e-12;
/** Contract payment PMT = P·r·(1+r)^n / ((1+r)^n − 1), zero-rate limit P/n. */
function contractPayment(balance, monthlyRate, months) {
    if (monthlyRate === 0)
        return balance / months;
    const growth = Math.pow(1 + monthlyRate, months);
    return (balance * monthlyRate * growth) / (growth - 1);
}
/**
 * Run one strategy over the horizon. Every month the budget is
 * `payment + extraBudget`; the loan takes what it needs (never more than the
 * outstanding balance plus interest) and the remainder is invested at the end
 * of the month. A cleared loan contributes nothing and the whole budget is
 * invested from then on.
 */
function simulate(input) {
    const { monthlyRate, payment, extraToLoan, extraBudget, horizon, investMonthlyRate } = input;
    let balance = input.balance;
    let months = 0;
    let interestSum = 0;
    let totalPaid = 0;
    let extraPaid = 0;
    let invested = 0;
    for (let month = 1; month <= horizon; month += 1) {
        let paid = 0;
        if (balance > 0) {
            const interest = balance * monthlyRate;
            paid = payment + extraToLoan;
            // the final month settles whatever is left, so no residual dust is left
            // behind and (payments − principal) is the true interest
            if (month === horizon || paid > balance + interest)
                paid = balance + interest;
            balance -= paid - interest;
            if (balance < ZERO_EPS)
                balance = 0;
            interestSum += interest;
            totalPaid += paid;
            extraPaid += Math.max(0, paid - payment);
            if (balance === 0 && months === 0)
                months = month;
        }
        invested = invested * (1 + investMonthlyRate) + (payment + extraBudget - paid);
    }
    return { months, interestSum, totalPaid, extraPaid, invested };
}
/** Validate the scenario inputs; returns a reason string or null when valid. */
export function validateExtraInput(balance, annualRatePercent, remainingMonths, extraPayment, investRatePercent) {
    if (!Number.isFinite(balance) || balance <= 0)
        return 'balance must be a positive number';
    if (!Number.isFinite(annualRatePercent) || annualRatePercent <= -100) {
        return 'annual_rate_percent must be greater than -100';
    }
    if (!Number.isInteger(remainingMonths) || remainingMonths < 1 || remainingMonths > MAX_EXTRA_MONTHS) {
        return `remaining_months must be an integer between 1 and ${MAX_EXTRA_MONTHS}`;
    }
    if (!Number.isFinite(extraPayment) || extraPayment <= 0) {
        return 'extra_payment must be a positive number (use loan_payment for a plain schedule)';
    }
    if (investRatePercent !== undefined
        && (!Number.isFinite(investRatePercent) || investRatePercent <= -100)) {
        return 'invest_rate_percent must be greater than -100';
    }
    return null;
}
/**
 * What one extra monthly payment does: months and interest saved, plus — only
 * when an investment rate is supplied — a like-for-like terminal comparison of
 * prepaying against investing the same money.
 */
export function computeExtraScenario(input) {
    const invalid = validateExtraInput(input.balance, input.annualRatePercent, input.remainingMonths, input.extraPayment, input.investRatePercent);
    if (invalid !== null)
        return { ok: false, reason: invalid };
    const monthlyRate = input.annualRatePercent / 100 / 12;
    const monthlyPayment = round2(contractPayment(input.balance, monthlyRate, input.remainingMonths));
    const baselineSim = simulate({
        balance: input.balance,
        monthlyRate,
        payment: monthlyPayment,
        extraToLoan: 0,
        extraBudget: 0,
        horizon: input.remainingMonths,
        investMonthlyRate: 0,
    });
    const baselineMonths = baselineSim.months > 0 ? baselineSim.months : input.remainingMonths;
    const investRate = input.investRatePercent;
    const investMonthlyRate = investRate === undefined ? 0 : investRate / 100 / 12;
    const extraSim = simulate({
        balance: input.balance,
        monthlyRate,
        payment: monthlyPayment,
        extraToLoan: input.extraPayment,
        extraBudget: input.extraPayment,
        horizon: baselineMonths,
        investMonthlyRate,
    });
    const result = {
        balance: round2(input.balance),
        annualRatePercent: input.annualRatePercent,
        remainingMonths: input.remainingMonths,
        extraPayment: round2(input.extraPayment),
        monthlyPayment,
        baseline: {
            months: baselineMonths,
            totalInterest: round2(baselineSim.interestSum),
            totalPaid: round2(baselineSim.totalPaid),
        },
        withExtra: {
            months: extraSim.months,
            totalInterest: round2(extraSim.interestSum),
            totalPaid: round2(extraSim.totalPaid),
            extraPaid: round2(extraSim.extraPaid),
        },
        monthsSaved: baselineMonths - extraSim.months,
        interestSaved: round2(baselineSim.interestSum - extraSim.interestSum),
        guaranteedReturnPercent: input.annualRatePercent,
        note: '',
    };
    if (investRate === undefined) {
        result.note = `Prepaying this loan has a known return: the loan rate (${input.annualRatePercent}%), `
            + 'guaranteed, because the interest it saves is never charged. No invest_rate_percent was given, '
            + 'so the prepay-versus-invest comparison is not reported rather than assumed.';
        return result;
    }
    const investSim = simulate({
        balance: input.balance,
        monthlyRate,
        payment: monthlyPayment,
        extraToLoan: 0,
        extraBudget: input.extraPayment,
        horizon: baselineMonths,
        investMonthlyRate,
    });
    const prepayValue = round2(extraSim.invested);
    const investValue = round2(investSim.invested);
    const difference = round2(prepayValue - investValue);
    const contributions = round2(input.extraPayment * baselineMonths);
    // The only legitimate gap between the two sides at equal rates is the
    // rounding of the contract payment to cents, and that gap grows with the
    // horizon exactly like an annuity. Bounding it that way keeps "tie" honest
    // without hand-tuning a magic number per loan size.
    const annuityFactor = investMonthlyRate === 0
        ? baselineMonths
        : (Math.pow(1 + investMonthlyRate, baselineMonths) - 1) / investMonthlyRate;
    const tolerance = Math.max(ROUNDING_CENT, ROUNDING_CENT * annuityFactor, contributions * TIE_RELATIVE);
    result.investing = {
        ratePercent: investRate,
        horizonMonths: baselineMonths,
        contributions,
        value: investValue,
        prepayValue,
        difference,
    };
    if (Math.abs(investRate - input.annualRatePercent) < RATE_EPS) {
        result.verdict = 'tie';
        result.note = `Same rate on both sides (${investRate}%): prepaying and investing are the same trade, `
            + 'so the two terminal values differ only by payment rounding.';
    }
    else if (Math.abs(difference) <= tolerance) {
        result.verdict = 'tie';
        result.note = `The two sides land within ${tolerance.toFixed(2)} of each other over ${baselineMonths} `
            + 'months — too close to call from these inputs.';
    }
    else {
        result.verdict = difference > 0 ? 'prepay_wins' : 'invest_wins';
        result.note = `Both sides use the same monthly budget over ${baselineMonths} months (the month the loan `
            + `would have cleared anyway); what the loan does not need is invested at ${investRate}%, monthly `
            + 'compounding. Prepaying is guaranteed; the investing side is a what-if at the rate you supplied, '
            + 'with no taxes, fees or risk premium modelled.';
    }
    return result;
}
//# sourceMappingURL=extra.js.map