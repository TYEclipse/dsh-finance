/**
 * Tool definitions for dsh-finance: eight deterministic money-math tools
 * exposed to every agent via defineTool. All outputs are lossless JSON —
 * optional fields are omitted rather than undefined (the dsh-tools output
 * gate). Pure arithmetic, no network, no filesystem, no dynamic evaluation.
 *
 * @module dsh-finance/tools
 */
import { type ToolDefinition } from '@deepseek-ai/dsh-tools';
export interface ToolSet {
    loan_payment: ToolDefinition;
    compound_growth: ToolDefinition;
    rate_convert: ToolDefinition;
    cashflow_analysis: ToolDefinition;
    retirement_plan: ToolDefinition;
    savings_goal: ToolDefinition;
    inflation_adjust: ToolDefinition;
    debt_payoff: ToolDefinition;
}
/** Build all eight tool definitions. */
export declare function buildFinanceTools(): ToolSet;
//# sourceMappingURL=tools.d.ts.map