/**
 * Tool definitions for dsh-finance: three deterministic money-math tools
 * exposed to every agent via defineTool. All outputs are lossless JSON —
 * optional fields are omitted rather than undefined (the dsh-tools output
 * gate). Pure arithmetic, no network, no filesystem, no dynamic evaluation.
 *
 * @module dsh-finance/tools
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { COMPOUNDING_PERIODS, computeGrowth, computeLoan, continuousEffectiveToNominal, continuousNominalToEffective, effectiveToNominal, nominalToEffective, } from "./finance.js";
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
const compoundingEnum = [...Object.keys(COMPOUNDING_PERIODS), 'continuous'];
/** Build all three tool definitions. */
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
    return { loan_payment, compound_growth, rate_convert };
}
//# sourceMappingURL=tools.js.map