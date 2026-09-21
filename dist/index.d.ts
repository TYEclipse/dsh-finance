/**
 * dsh-finance — money math toolbox for DeepSeek Harness.
 *
 * Seven deterministic tools, zero runtime dependencies (pure arithmetic):
 *   loan_payment      — fixed-rate loan payment, totals, optional schedule + extra payments
 *   compound_growth   — future value with monthly contributions, any compounding frequency
 *   rate_convert      — nominal (APR) <-> effective (EAR) rates, incl. continuous
 *   cashflow_analysis — NPV, IRR and payback periods for arbitrary cash-flow series
 *   retirement_plan   — time to exhaustion / sustainable withdrawal (safe-withdrawal math)
 *   savings_goal      — months to a target, or the contribution a deadline requires
 *   inflation_adjust  — future cost, present value and the real (Fisher) return
 *
 * Safety model: every tool is pure, read-only and offline — no network, no
 * filesystem access, no dynamic evaluation. Financial formulas are exact;
 * amounts are rounded to cents only at the output boundary.
 *
 * @module dsh-finance
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Stable Cordis plugin name (also the config key under `plugins:`). */
export declare const name = "dsh-finance";
/** Services required before tool registration can start. */
export declare const inject: string[];
/** Plugin configuration (reserved for future tuning; no options today). */
export interface Config {
}
export declare const Config: z<Config>;
/** Mount the finance tools on every live agent and every future one. */
export declare function apply(ctx: Context, _config: Config): void;
//# sourceMappingURL=index.d.ts.map