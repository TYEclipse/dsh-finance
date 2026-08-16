/**
 * dsh-finance — money math toolbox for DeepSeek Harness.
 *
 * Three deterministic tools, zero runtime dependencies (pure arithmetic):
 *   loan_payment     — fixed-rate loan payment, totals, optional schedule + extra payments
 *   compound_growth  — future value with monthly contributions, any compounding frequency
 *   rate_convert     — nominal (APR) <-> effective (EAR) rates, incl. continuous
 *
 * Safety model: every tool is pure, read-only and offline — no network, no
 * filesystem access, no dynamic evaluation. Financial formulas are exact;
 * amounts are rounded to cents only at the output boundary.
 *
 * @module dsh-finance
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import z from '@deepseek-ai/schemastery'
import { buildFinanceTools, type ToolSet } from './tools.ts'

/** Stable Cordis plugin name (also the config key under `plugins:`). */
export const name = 'dsh-finance'

/** Services required before tool registration can start. */
export const inject = ['agents', 'tools']

/** Plugin configuration (reserved for future tuning; no options today). */
export interface Config {}

export const Config: z<Config> = z.object({})

/** Register every finance tool on one agent; returns the disposer. */
function decorate(agent: Agent, tools: ToolSet): () => void {
  const disposers = Object.values(tools).map((definition) => agent.ctx.tools.register(definition))
  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        // already disposed
      }
    }
  }
}

/** Mount the finance tools on every live agent and every future one. */
export function apply(ctx: Context, _config: Config): void {
  const tools = buildFinanceTools()
  const disposers = new Set<() => void>()

  const decorateAgent = (agent: Agent): void => {
    try {
      disposers.add(decorate(agent, tools))
    } catch (error) {
      ctx.logger('finance').warn(`tool registration for agent ${agent.id} failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  for (const agent of ctx.agents.list()) decorateAgent(agent)
  const off = ctx.on('agent/created', ({ agent }) => decorateAgent(agent))

  ctx.effect(() => () => {
    off()
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        // already disposed
      }
    }
    disposers.clear()
  })
}
