/**
 * Tool definitions for dsh-finance: five deterministic money-math tools
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
}
/** Build all five tool definitions. */
export declare function buildFinanceTools(): ToolSet;
//# sourceMappingURL=tools.d.ts.map