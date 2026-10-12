/**
 * Tool definitions for dsh-finance: eight deterministic money-math tools
 * exposed to every agent via defineTool. All outputs are lossless JSON —
 * optional fields are omitted rather than undefined (the dsh-tools output
 * gate). Pure arithmetic, no network, no filesystem, no dynamic evaluation.
 *
 * @module dsh-finance/tools
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { COMPOUNDING_PERIODS, computeGrowth, computeLoan, continuousEffectiveToNominal, continuousNominalToEffective, effectiveToNominal, nominalToEffective, } from "./finance.js";
import { analyzeCashflows, } from "./cashflow.js";
import { planRetirement, } from "./retirement.js";
import { computeSavingsGoal, MAX_GOAL_MONTHS, } from "./savings.js";
import { computeInflation, } from "./inflation.js";
import { computeDebtPayoff, MAX_DEBTS, } from "./debt.js";
function renderLoan(value) {
    const result = value;
    if (!result.valid)
        return `cannot compute loan: ${result.reason ?? 'unknown reason'}`;
    const extra = result.months_saved !== undefined
        ? ` (with extra payments: payoff in ${result.payoff_months} months, ${result.months_saved} months saved, $${result.interest_saved} interest saved)`
        : '';
    return `monthly payment $${result.monthly_payment} for $${result.principal} at ${result.annual_rate_percent}% over ${result.months} months`
        + ` — total paid $${result.total_paid}, total interest $${result.total_interest}${extra}`
        + (result.schedule ? `, ${result.schedule.length} schedule rows` : '');
}
function renderGrowth(value) {
    const result = value;
    if (!result.valid)
        return `cannot compute growth: ${result.reason ?? 'unknown reason'}`;
    return `$${result.principal} at ${result.annual_rate_percent}% ${result.compounding} for ${result.years} years`
        + ` (${result.months} months) + $${result.contribution_per_month}/month`
        + ` → $${result.future_value} (contributions $${result.total_contributions}, interest $${result.interest_earned})`;
}
function renderRate(value) {
    const result = value;
    if (!result.valid)
        return `cannot convert rate: ${result.reason ?? 'unknown reason'}`;
    return `${result.input_rate_percent}% ${result.input_kind} (${result.compounding})`
        + ` = ${result.output_rate_percent}% ${result.output_kind}`;
}
function renderCashflow(value) {
    const result = value;
    if (!result.valid)
        return `cannot analyze cash flows: ${result.reason ?? 'unknown reason'}`;
    let text = `${result.periods} periods — in $${result.total_inflow}, out $${result.total_outflow}, net $${result.net_cashflow}`;
    if (result.npv !== undefined)
        text += `; NPV $${result.npv}`;
    if (result.irr_percent !== undefined)
        text += `; IRR ${result.irr_percent}%`;
    if (result.multiple_irr_possible === true)
        text += '; multiple sign changes — IRR may not be unique';
    if (result.irr_note !== undefined)
        text += ` (${result.irr_note})`;
    if (result.payback_periods !== undefined)
        text += `; payback ${result.payback_periods} periods`;
    if (result.discounted_payback_periods !== undefined)
        text += `; discounted payback ${result.discounted_payback_periods} periods`;
    return text;
}
function renderRetirement(value) {
    const result = value;
    if (!result.valid)
        return `cannot plan retirement: ${result.reason ?? 'unknown reason'}`;
    let text = `$${result.principal} at ${result.annual_rate_percent}%`;
    if (result.monthly_withdrawal !== undefined) {
        text += ` with $${result.monthly_withdrawal}/month (${result.withdrawal_rate_percent}%/yr)`;
        if (result.never_exhausts === true)
            text += ' — never exhausts';
        else if (result.years_to_exhaust !== undefined)
            text += ` — exhausts in ${result.years_to_exhaust} years`;
    }
    if (result.sustainable_monthly_withdrawal !== undefined) {
        text += ` → sustainable $${result.sustainable_monthly_withdrawal}/month over ${result.horizon_years} years`;
        text += ` (total withdrawn $${result.total_withdrawn}, interest $${result.interest_earned})`;
    }
    if (result.lasts_horizon !== undefined)
        text += `; lasts horizon: ${result.lasts_horizon ? 'yes' : 'no'}`;
    return text;
}
function renderGoal(value) {
    const result = value;
    if (!result.valid)
        return `cannot plan the savings goal: ${result.reason ?? 'unknown reason'}`;
    let text = `target $${result.target_amount} from $${result.current_savings} at ${result.annual_rate_percent}%`;
    if (result.monthly_contribution !== undefined) {
        if (result.already_reached === true)
            text += ' — target already reached';
        else if (result.unreachable === true)
            text += ` with $${result.monthly_contribution}/month — not reached within ${MAX_GOAL_MONTHS / 12} years`;
        else {
            text += ` with $${result.monthly_contribution}/month — reached in ${result.months_to_goal} months`;
            text += ` (balance $${result.final_balance}; paid in $${result.total_contributions}, interest $${result.interest_earned})`;
        }
    }
    if (result.required_monthly_contribution !== undefined) {
        text += ` → needs $${result.required_monthly_contribution}/month for ${result.horizon_months} months`;
        text += ` (projected $${result.projected_balance}, interest $${result.projected_interest})`;
    }
    if (result.on_track !== undefined)
        text += `; on track: ${result.on_track ? 'yes' : 'no'}`;
    return text;
}
function renderDebtPayoff(value) {
    const result = value;
    if (!result.valid)
        return `cannot plan the payoff: ${result.reason ?? 'unknown reason'}`;
    if (result.debt_free !== true) {
        return `${result.debt_count} debts on $${result.monthly_budget}/month: ${result.note ?? 'no payoff within 100 years'}`;
    }
    const best = result.best_strategy === 'tie' || result.best_strategy === undefined
        ? 'both strategies cost the same interest'
        : `${result.best_strategy} costs $${result.interest_saved_by_best} less interest than the other ordering`;
    return `${result.debt_count} debts on $${result.monthly_budget}/month (${result.strategy}): debt-free in`
        + ` ${result.months_to_debt_free} months — paid $${result.total_paid}, interest $${result.total_interest} (${best})`;
}
function renderInflation(value) {
    const result = value;
    if (!result.valid)
        return `cannot adjust for inflation: ${result.reason ?? 'unknown reason'}`;
    let text = `$${result.amount} at ${result.annual_inflation_percent}% inflation over ${result.years} years (${result.months} months)`
        + ` — future cost $${result.future_cost}, today's value of a future $${result.amount} $${result.real_value}`;
    if (result.nominal_rate_percent !== undefined) {
        text += `; at ${result.nominal_rate_percent}% nominal → real ${result.real_rate_percent}%/yr`;
        text += ` (nominal $${result.nominal_future_value}, real $${result.real_future_value})`;
    }
    return text;
}
const compoundingEnum = [...Object.keys(COMPOUNDING_PERIODS), 'continuous'];
/** Build all eight tool definitions. */
export function buildFinanceTools() {
    const loan_payment = defineTool({
        name: 'loan_payment',
        description: 'Compute the fixed monthly payment of an amortizing loan (mortgage, car loan, personal loan) '
            + 'from principal, annual interest rate and term: PMT = P·r·(1+r)^n/((1+r)^n−1). Returns the monthly payment, '
            + 'total paid and total interest; optionally an amortization schedule (capped at 360 rows) and/or the impact of '
            + 'a constant extra principal payment each month (term shortened, interest saved). Deterministic, offline, no fees assumed.',
        parameters: {
            principal: { type: 'number', required: true, description: 'Loan amount in currency units, e.g. 300000 for a 300k mortgage.' },
            annual_rate_percent: { type: 'number', required: true, description: 'Annual interest rate in percent, e.g. 4 for 4% APR.' },
            months: { type: 'number', required: true, description: 'Loan term in months (integer 1–1200), e.g. 360 for 30 years.' },
            extra_principal_per_month: { type: 'number', description: 'Optional constant extra principal payment each month; shortens the term.' },
            include_schedule: { type: 'boolean', description: 'Include month-by-month amortization rows (capped at 360). Default false.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    valid: { type: 'boolean', required: true },
                    principal: { type: 'number' },
                    annual_rate_percent: { type: 'number' },
                    months: { type: 'number' },
                    monthly_payment: { type: 'number' },
                    total_paid: { type: 'number' },
                    total_interest: { type: 'number' },
                    payoff_months: { type: 'number' },
                    months_saved: { type: 'number' },
                    interest_saved: { type: 'number' },
                    schedule: {
                        type: 'array',
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                month: { type: 'number' },
                                payment: { type: 'number' },
                                principal: { type: 'number' },
                                interest: { type: 'number' },
                                balance: { type: 'number' },
                            },
                        },
                    },
                    truncated: { type: 'boolean' },
                    reason: { type: 'string' },
                },
            },
            render: (_args, value) => [{ type: 'text', text: renderLoan(value) }],
        },
        async execute(args) {
            const computed = computeLoan({
                principal: args.principal,
                annualRatePercent: args.annual_rate_percent,
                months: args.months,
                extraPerMonth: args.extra_principal_per_month ?? 0,
            }, { includeSchedule: args.include_schedule === true });
            if (!('monthlyPayment' in computed)) {
                return { valid: false, reason: computed.reason };
            }
            const result = computed;
            const out = {
                valid: true,
                principal: args.principal,
                annual_rate_percent: args.annual_rate_percent,
                months: args.months,
                monthly_payment: result.monthlyPayment,
                total_paid: result.totalPaid,
                total_interest: result.totalInterest,
                payoff_months: result.payoffMonths,
            };
            if (result.monthsSaved !== undefined)
                out.months_saved = result.monthsSaved;
            if (result.interestSaved !== undefined)
                out.interest_saved = result.interestSaved;
            if (result.schedule !== undefined)
                out.schedule = result.schedule;
            if (result.truncated === true)
                out.truncated = true;
            return out;
        },
    });
    const compound_growth = defineTool({
        name: 'compound_growth',
        description: 'Project the future value of a lump sum with optional monthly contributions under compound interest. '
            + 'Supports daily/monthly/quarterly/semiannually/annually/continuous compounding; the annual rate is converted to an '
            + 'effective monthly rate so contributions compose exactly. Returns future value, total contributions and interest '
            + 'earned; optionally a year-by-year breakdown (capped at 60 rows). Deterministic, offline, contributions at month end.',
        parameters: {
            principal: { type: 'number', required: true, description: 'Starting amount, e.g. 1000.' },
            annual_rate_percent: { type: 'number', required: true, description: 'Annual interest rate in percent, e.g. 5 for 5%.' },
            years: { type: 'number', required: true, description: 'Investment horizon in years (1/12 to 200).' },
            compounding: { type: 'string', enum: compoundingEnum, required: true, description: 'Compounding frequency.' },
            contribution_per_month: { type: 'number', description: 'Optional fixed contribution added at the end of each month.' },
            include_breakdown: { type: 'boolean', description: 'Include year-by-year rows (capped at 60). Default false.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    valid: { type: 'boolean', required: true },
                    principal: { type: 'number' },
                    annual_rate_percent: { type: 'number' },
                    years: { type: 'number' },
                    compounding: { type: 'string' },
                    contribution_per_month: { type: 'number' },
                    months: { type: 'number' },
                    future_value: { type: 'number' },
                    total_contributions: { type: 'number' },
                    interest_earned: { type: 'number' },
                    breakdown: {
                        type: 'array',
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                year: { type: 'number' },
                                balance: { type: 'number' },
                                contributions: { type: 'number' },
                                interest: { type: 'number' },
                            },
                        },
                    },
                    reason: { type: 'string' },
                },
            },
            render: (_args, value) => [{ type: 'text', text: renderGrowth(value) }],
        },
        async execute(args) {
            const computed = computeGrowth({
                principal: args.principal,
                annualRatePercent: args.annual_rate_percent,
                years: args.years,
                compounding: args.compounding,
                contributionPerMonth: args.contribution_per_month ?? 0,
            }, { includeBreakdown: args.include_breakdown === true });
            if (!('futureValue' in computed)) {
                return { valid: false, reason: computed.reason };
            }
            const result = computed;
            const out = {
                valid: true,
                principal: args.principal,
                annual_rate_percent: args.annual_rate_percent,
                years: args.years,
                compounding: args.compounding,
                contribution_per_month: args.contribution_per_month ?? 0,
                months: result.months,
                future_value: result.futureValue,
                total_contributions: result.totalContributions,
                interest_earned: result.interestEarned,
            };
            if (result.breakdown !== undefined)
                out.breakdown = result.breakdown;
            return out;
        },
    });
    const rate_convert = defineTool({
        name: 'rate_convert',
        description: 'Convert between nominal (APR-style) and effective annual rates. Nominal → EAR: '
            + '(1+r/n)^n − 1; EAR → nominal: n·((1+EAR)^(1/n) − 1). Continuous compounding supported (EAR = e^r − 1, r = ln(1+EAR)). '
            + 'Typical use: what EAR does a "12% nominal, compounded monthly" loan actually charge, or what nominal rate yields a target EAR. '
            + 'Deterministic, offline.',
        parameters: {
            rate_percent: { type: 'number', required: true, description: 'The rate to convert, in percent (e.g. 12 for 12%).' },
            input_kind: { type: 'string', enum: ['nominal', 'effective'], required: true, description: 'Whether the input rate is a nominal (APR) or effective (EAR) rate.' },
            compounding: { type: 'string', enum: compoundingEnum, required: true, description: 'Compounding frequency of the rate being converted.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    valid: { type: 'boolean', required: true },
                    input_rate_percent: { type: 'number' },
                    input_kind: { type: 'string' },
                    compounding: { type: 'string' },
                    output_rate_percent: { type: 'number' },
                    output_kind: { type: 'string' },
                    reason: { type: 'string' },
                },
            },
            render: (_args, value) => [{ type: 'text', text: renderRate(value) }],
        },
        async execute(args) {
            const rate = args.rate_percent;
            if (!Number.isFinite(rate))
                return { valid: false, reason: 'rate_percent must be a finite number' };
            if (args.input_kind !== 'nominal' && args.input_kind !== 'effective') {
                return { valid: false, reason: 'input_kind must be "nominal" or "effective"' };
            }
            const compounding = args.compounding;
            if (!(compounding in COMPOUNDING_PERIODS) && compounding !== 'continuous') {
                return { valid: false, reason: `compounding must be one of: ${compoundingEnum.join(', ')}` };
            }
            if (rate <= -100)
                return { valid: false, reason: 'rate_percent must be greater than -100' };
            let output;
            if (compounding === 'continuous') {
                output = args.input_kind === 'nominal'
                    ? continuousNominalToEffective(rate)
                    : continuousEffectiveToNominal(rate);
            }
            else {
                const periods = COMPOUNDING_PERIODS[compounding];
                output = args.input_kind === 'nominal'
                    ? nominalToEffective(rate, periods)
                    : effectiveToNominal(rate, periods);
            }
            if (!Number.isFinite(output))
                return { valid: false, reason: 'conversion is undefined for this input' };
            const out = {
                valid: true,
                input_rate_percent: rate,
                input_kind: args.input_kind,
                compounding,
                output_rate_percent: output,
                output_kind: args.input_kind === 'nominal' ? 'effective (EAR)' : 'nominal (APR)',
            };
            return out;
        },
    });
    const cashflow_analysis = defineTool({
        name: 'cashflow_analysis',
        description: 'Analyze an arbitrary series of cash flows (investments, projects, bonds): net present value at a '
            + 'discount rate, internal rate of return (IRR, found by bisection), and payback periods (simple and discounted). '
            + 'Entry 0 is time 0 — typically the initial outlay (negative); entry t is the flow at the end of period t. '
            + 'IRR is undefined when flows never change sign and may not be unique when they change sign more than once — '
            + 'both cases are reported explicitly instead of fabricating a rate. Deterministic, offline.',
        parameters: {
            cash_flows: { type: 'array', items: { type: 'number' }, required: true, description: 'Cash flows in order, entry 0 at time 0, e.g. [-1000, 400, 400, 400, 400] (2 to 1200 entries).' },
            discount_rate_percent: { type: 'number', description: 'Discount rate in percent for NPV and discounted payback, e.g. 10 for 10%.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    valid: { type: 'boolean', required: true },
                    periods: { type: 'number' },
                    total_inflow: { type: 'number' },
                    total_outflow: { type: 'number' },
                    net_cashflow: { type: 'number' },
                    npv: { type: 'number' },
                    irr_percent: { type: 'number' },
                    multiple_irr_possible: { type: 'boolean' },
                    irr_note: { type: 'string' },
                    payback_periods: { type: 'number' },
                    discounted_payback_periods: { type: 'number' },
                    reason: { type: 'string' },
                },
            },
            render: (_args, value) => [{ type: 'text', text: renderCashflow(value) }],
        },
        async execute(args) {
            const computed = analyzeCashflows(args.cash_flows, args.discount_rate_percent);
            if (!('periods' in computed)) {
                return { valid: false, reason: computed.reason };
            }
            const result = computed;
            const out = {
                valid: true,
                periods: result.periods,
                total_inflow: result.totalInflow,
                total_outflow: result.totalOutflow,
                net_cashflow: result.netCashflow,
            };
            if (result.npv !== undefined)
                out.npv = result.npv;
            if (result.irrPercent !== undefined)
                out.irr_percent = result.irrPercent;
            if (result.multipleIrrPossible === true)
                out.multiple_irr_possible = true;
            if (result.irrNote !== undefined)
                out.irr_note = result.irrNote;
            if (result.paybackPeriods !== undefined)
                out.payback_periods = result.paybackPeriods;
            if (result.discountedPaybackPeriods !== undefined)
                out.discounted_payback_periods = result.discountedPaybackPeriods;
            return out;
        },
    });
    const retirement_plan = defineTool({
        name: 'retirement_plan',
        description: 'Retirement and withdrawal planning: given savings and an expected annual return, either compute how '
            + 'long the money lasts under a fixed monthly withdrawal (time to exhaustion — the 4%-rule family), or compute the '
            + 'sustainable monthly withdrawal that depletes the balance exactly at a horizon in years (PMT closed form). '
            + 'Reports the withdrawal rate, total withdrawn and interest earned; with both inputs, also reports whether the '
            + 'withdrawal lasts the horizon. Monthly compounding, withdrawals at month end. Deterministic, offline.',
        parameters: {
            principal: { type: 'number', required: true, description: 'Current savings, e.g. 1000000.' },
            annual_rate_percent: { type: 'number', required: true, description: 'Expected annual return in percent, e.g. 4 for 4%.' },
            monthly_withdrawal: { type: 'number', description: 'Fixed monthly withdrawal; computes time to exhaustion.' },
            years: { type: 'number', description: 'Horizon in years (1/12 to 200); computes the sustainable monthly withdrawal.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    valid: { type: 'boolean', required: true },
                    principal: { type: 'number' },
                    annual_rate_percent: { type: 'number' },
                    monthly_withdrawal: { type: 'number' },
                    withdrawal_rate_percent: { type: 'number' },
                    months_to_exhaust: { type: 'number' },
                    years_to_exhaust: { type: 'number' },
                    never_exhausts: { type: 'boolean' },
                    sustainable_monthly_withdrawal: { type: 'number' },
                    horizon_months: { type: 'number' },
                    horizon_years: { type: 'number' },
                    total_withdrawn: { type: 'number' },
                    interest_earned: { type: 'number' },
                    lasts_horizon: { type: 'boolean' },
                    reason: { type: 'string' },
                },
            },
            render: (_args, value) => [{ type: 'text', text: renderRetirement(value) }],
        },
        async execute(args) {
            const computed = planRetirement({
                principal: args.principal,
                annualRatePercent: args.annual_rate_percent,
                monthlyWithdrawal: args.monthly_withdrawal,
                years: args.years,
            });
            if (!('principal' in computed)) {
                return { valid: false, reason: computed.reason };
            }
            const result = computed;
            const out = {
                valid: true,
                principal: result.principal,
                annual_rate_percent: result.annualRatePercent,
            };
            if (result.monthlyWithdrawal !== undefined)
                out.monthly_withdrawal = result.monthlyWithdrawal;
            if (result.withdrawalRatePercent !== undefined)
                out.withdrawal_rate_percent = result.withdrawalRatePercent;
            if (result.monthsToExhaust !== undefined)
                out.months_to_exhaust = result.monthsToExhaust;
            if (result.yearsToExhaust !== undefined)
                out.years_to_exhaust = result.yearsToExhaust;
            if (result.neverExhausts === true)
                out.never_exhausts = true;
            if (result.sustainableMonthlyWithdrawal !== undefined)
                out.sustainable_monthly_withdrawal = result.sustainableMonthlyWithdrawal;
            if (result.horizonMonths !== undefined)
                out.horizon_months = result.horizonMonths;
            if (result.horizonYears !== undefined)
                out.horizon_years = result.horizonYears;
            if (result.totalWithdrawn !== undefined)
                out.total_withdrawn = result.totalWithdrawn;
            if (result.interestEarned !== undefined)
                out.interest_earned = result.interestEarned;
            if (result.lastsHorizon !== undefined)
                out.lasts_horizon = result.lastsHorizon;
            return out;
        },
    });
    const savings_goal = defineTool({
        name: 'savings_goal',
        description: 'Goal-based saving math: with a monthly contribution, how long until savings reach a target '
            + '(iterated month by month, contributions at month end); with a deadline in months, the monthly contribution that '
            + 'gets there (annuity closed form, rounded up to the cent so the plan actually arrives). Give both to also learn '
            + 'whether the contribution meets the deadline. Reports the balances, everything paid in, interest earned and — '
            + 'for the deadline mode — the projected balance of the cent-rounded plan. Monthly compounding; reports '
            + '"unreachable" instead of pretending a zero-contribution, zero-return gap ever closes. Deterministic, offline.',
        parameters: {
            target_amount: { type: 'number', required: true, description: 'Goal amount to reach, e.g. 50000.' },
            annual_rate_percent: { type: 'number', required: true, description: 'Annual return in percent, e.g. 5 for 5%.' },
            current_savings: { type: 'number', description: 'Amount already saved (default 0).' },
            monthly_contribution: { type: 'number', description: 'Fixed end-of-month contribution; answers "when do I get there?".' },
            months: { type: 'number', description: `Deadline in months (1–${MAX_GOAL_MONTHS}); answers "what must I save?".` },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    valid: { type: 'boolean', required: true },
                    target_amount: { type: 'number' },
                    current_savings: { type: 'number' },
                    annual_rate_percent: { type: 'number' },
                    monthly_contribution: { type: 'number' },
                    months_to_goal: { type: 'number' },
                    final_balance: { type: 'number' },
                    total_contributions: { type: 'number' },
                    interest_earned: { type: 'number' },
                    already_reached: { type: 'boolean' },
                    unreachable: { type: 'boolean' },
                    required_monthly_contribution: { type: 'number' },
                    horizon_months: { type: 'number' },
                    projected_balance: { type: 'number' },
                    projected_interest: { type: 'number' },
                    on_track: { type: 'boolean' },
                    reason: { type: 'string' },
                },
            },
            render: (_args, value) => [{ type: 'text', text: renderGoal(value) }],
        },
        async execute(args) {
            const computed = computeSavingsGoal({
                targetAmount: args.target_amount,
                annualRatePercent: args.annual_rate_percent,
                currentSavings: args.current_savings,
                monthlyContribution: args.monthly_contribution,
                months: args.months,
            });
            if (!('targetAmount' in computed)) {
                return { valid: false, reason: computed.reason };
            }
            const result = computed;
            const out = {
                valid: true,
                target_amount: result.targetAmount,
                current_savings: result.currentSavings,
                annual_rate_percent: result.annualRatePercent,
            };
            if (result.monthlyContribution !== undefined)
                out.monthly_contribution = result.monthlyContribution;
            if (result.monthsToGoal !== undefined)
                out.months_to_goal = result.monthsToGoal;
            if (result.finalBalance !== undefined)
                out.final_balance = result.finalBalance;
            if (result.totalContributions !== undefined)
                out.total_contributions = result.totalContributions;
            if (result.interestEarned !== undefined)
                out.interest_earned = result.interestEarned;
            if (result.alreadyReached === true)
                out.already_reached = true;
            if (result.unreachable === true)
                out.unreachable = true;
            if (result.requiredMonthlyContribution !== undefined)
                out.required_monthly_contribution = result.requiredMonthlyContribution;
            if (result.horizonMonths !== undefined)
                out.horizon_months = result.horizonMonths;
            if (result.projectedBalance !== undefined)
                out.projected_balance = result.projectedBalance;
            if (result.projectedInterest !== undefined)
                out.projected_interest = result.projectedInterest;
            if (result.onTrack !== undefined)
                out.on_track = result.onTrack;
            return out;
        },
    });
    const inflation_adjust = defineTool({
        name: 'inflation_adjust',
        description: 'Purchasing-power math: what an amount today costs after N years of inflation (future cost), what a '
            + 'future nominal amount is worth in today\'s money (present value), and — when a nominal return is given — the '
            + 'real (inflation-adjusted) return via the exact Fisher relation (1+nominal)/(1+inflation) − 1 plus the nominal '
            + 'and real future values side by side. Years may be fractional (0.5 = six months). Handles deflation (negative '
            + 'inflation) and reports a negative or zero real return honestly instead of clamping. Deterministic, offline.',
        parameters: {
            amount: { type: 'number', required: true, description: 'Amount in currency units, e.g. 1000.' },
            annual_inflation_percent: { type: 'number', required: true, description: 'Annual inflation in percent, e.g. 2.5; negative means deflation.' },
            years: { type: 'number', required: true, description: 'Horizon in years (1/12 to 200); fractions allowed, e.g. 0.5.' },
            nominal_rate_percent: { type: 'number', description: 'Optional nominal annual return in percent; unlocks the real-return fields.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    valid: { type: 'boolean', required: true },
                    amount: { type: 'number' },
                    annual_inflation_percent: { type: 'number' },
                    years: { type: 'number' },
                    months: { type: 'number' },
                    future_cost: { type: 'number' },
                    real_value: { type: 'number' },
                    nominal_rate_percent: { type: 'number' },
                    real_rate_percent: { type: 'number' },
                    nominal_future_value: { type: 'number' },
                    real_future_value: { type: 'number' },
                    reason: { type: 'string' },
                },
            },
            render: (_args, value) => [{ type: 'text', text: renderInflation(value) }],
        },
        async execute(args) {
            const computed = computeInflation({
                amount: args.amount,
                annualInflationPercent: args.annual_inflation_percent,
                years: args.years,
                nominalRatePercent: args.nominal_rate_percent,
            });
            if (!('amount' in computed)) {
                return { valid: false, reason: computed.reason };
            }
            const result = computed;
            const out = {
                valid: true,
                amount: result.amount,
                annual_inflation_percent: result.annualInflationPercent,
                years: result.years,
                months: result.months,
                future_cost: result.futureCost,
                real_value: result.realValue,
            };
            if (result.nominalRatePercent !== undefined)
                out.nominal_rate_percent = result.nominalRatePercent;
            if (result.realRatePercent !== undefined)
                out.real_rate_percent = result.realRatePercent;
            if (result.nominalFutureValue !== undefined)
                out.nominal_future_value = result.nominalFutureValue;
            if (result.realFutureValue !== undefined)
                out.real_future_value = result.realFutureValue;
            return out;
        },
    });
    const debt_payoff = defineTool({
        name: 'debt_payoff',
        description: 'Payoff plan for several debts against one fixed monthly budget. Every minimum payment is made '
            + 'first (they are contractual), the leftover budget attacks one debt at a time, and the whole plan is '
            + 'simulated month by month — for avalanche (highest rate first) and for snowball (smallest balance first), '
            + 'so the difference between the two orderings is a number rather than a slogan. Reports months to debt-free, '
            + 'everything paid, total interest, the order the balances actually clear in, and which strategy wins. '
            + 'A budget that only covers minimums below the monthly interest is reported as never clearing '
            + '(debt_free false + note) instead of inventing a month count. Monthly compounding; amounts rounded to '
            + 'cents at the output boundary. Deterministic, offline.',
        parameters: {
            debts: {
                type: 'array',
                required: true,
                description: `The debts to pay off, 1–${MAX_DEBTS} entries: { name?, balance, annual_rate_percent, minimum_payment }. `
                    + 'name is optional (defaults to "debt N"); minimum_payment is the contractual amount due each month.',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        name: { type: 'string', description: 'Label for the debt, e.g. "visa". Echoed back in the payoff order.' },
                        balance: { type: 'number', description: 'Current balance, e.g. 5000.' },
                        annual_rate_percent: { type: 'number', description: 'Annual interest rate in percent, e.g. 22 for 22%.' },
                        minimum_payment: { type: 'number', description: 'Minimum payment due each month, e.g. 100.' },
                    },
                },
            },
            monthly_budget: { type: 'number', required: true, description: 'Total amount available each month; must be at least the sum of the minimum payments.' },
            strategy: { type: 'string', enum: ['avalanche', 'snowball'], description: 'Which ordering to use for the reported plan: avalanche (highest rate first, default) or snowball (smallest balance first). Both are always simulated.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    valid: { type: 'boolean', required: true },
                    monthly_budget: { type: 'number' },
                    debt_count: { type: 'number' },
                    total_balance: { type: 'number' },
                    total_minimums: { type: 'number' },
                    extra_per_month: { type: 'number' },
                    strategy: { type: 'string' },
                    priority_order: { type: 'array', items: { type: 'string' } },
                    debt_free: { type: 'boolean' },
                    months_to_debt_free: { type: 'number' },
                    total_paid: { type: 'number' },
                    total_interest: { type: 'number' },
                    payoff_order: {
                        type: 'array',
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                name: { type: 'string' },
                                cleared_month: { type: 'number' },
                                interest_paid: { type: 'number' },
                                paid: { type: 'number' },
                            },
                        },
                    },
                    comparison: {
                        type: 'array',
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                strategy: { type: 'string' },
                                debt_free: { type: 'boolean' },
                                months_to_debt_free: { type: 'number' },
                                total_interest: { type: 'number' },
                            },
                        },
                    },
                    best_strategy: { type: 'string' },
                    interest_saved_by_best: { type: 'number' },
                    months_saved_by_best: { type: 'number' },
                    note: { type: 'string' },
                    reason: { type: 'string' },
                },
            },
            render: (_args, value) => [{ type: 'text', text: renderDebtPayoff(value) }],
        },
        async execute(args) {
            const inputDebts = (Array.isArray(args.debts) ? args.debts : []);
            const computed = computeDebtPayoff({
                debts: inputDebts.map((debt) => ({
                    name: debt?.name,
                    balance: debt?.balance ?? Number.NaN,
                    annualRatePercent: debt?.annual_rate_percent ?? Number.NaN,
                    minimumPayment: debt?.minimum_payment ?? Number.NaN,
                })),
                monthlyBudget: args.monthly_budget,
                strategy: args.strategy === 'snowball' ? 'snowball' : 'avalanche',
            });
            if (!('debtCount' in computed)) {
                return { valid: false, reason: computed.reason };
            }
            const result = computed;
            const out = {
                valid: true,
                monthly_budget: result.monthlyBudget,
                debt_count: result.debtCount,
                total_balance: result.totalBalance,
                total_minimums: result.totalMinimums,
                extra_per_month: result.extraPerMonth,
                strategy: result.strategy,
                priority_order: result.priorityOrder,
                debt_free: result.debtFree,
                payoff_order: result.payoffOrder.map((row) => ({
                    name: row.name,
                    cleared_month: row.clearedMonth,
                    interest_paid: row.interestPaid,
                    paid: row.paid,
                })),
                comparison: result.comparison.map((entry) => {
                    const item = {
                        strategy: entry.strategy,
                        debt_free: entry.debtFree,
                    };
                    if (entry.monthsToDebtFree !== undefined)
                        item.months_to_debt_free = entry.monthsToDebtFree;
                    if (entry.totalInterest !== undefined)
                        item.total_interest = entry.totalInterest;
                    return item;
                }),
            };
            if (result.monthsToDebtFree !== undefined)
                out.months_to_debt_free = result.monthsToDebtFree;
            if (result.totalPaid !== undefined)
                out.total_paid = result.totalPaid;
            if (result.totalInterest !== undefined)
                out.total_interest = result.totalInterest;
            if (result.bestStrategy !== undefined)
                out.best_strategy = result.bestStrategy;
            if (result.interestSavedByBest !== undefined)
                out.interest_saved_by_best = result.interestSavedByBest;
            if (result.monthsSavedByBest !== undefined)
                out.months_saved_by_best = result.monthsSavedByBest;
            if (result.note !== undefined)
                out.note = result.note;
            return out;
        },
    });
    return {
        loan_payment,
        compound_growth,
        rate_convert,
        cashflow_analysis,
        retirement_plan,
        savings_goal,
        inflation_adjust,
        debt_payoff,
    };
}
//# sourceMappingURL=tools.js.map