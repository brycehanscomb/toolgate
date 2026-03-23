import type { Middleware, ToolCall, VerdictResult } from './types'
import { isVerdictResult, next, NEXT } from './verdicts'

export function definePolicy(middlewares: Middleware[]): Middleware[] {
  return middlewares
}

export interface TracedResult {
  result: VerdictResult
  /** Index of the middleware that returned the verdict, or -1 if all returned next() */
  index: number
  /** Name of the middleware function, if available */
  name: string | null
}

export async function runPolicy(middlewares: Middleware[], call: ToolCall): Promise<VerdictResult> {
  const { result } = await runPolicyWithTrace(middlewares, call)
  return result
}

export async function runPolicyWithTrace(middlewares: Middleware[], call: ToolCall): Promise<TracedResult> {
  for (let i = 0; i < middlewares.length; i++) {
    const mw = middlewares[i]
    const result = await mw(call)

    if (!isVerdictResult(result)) {
      throw new Error(
        `toolgate: middleware[${i}] returned invalid verdict: ${JSON.stringify(result)}\n` +
        `  Every middleware must return allow(), deny(), or next().`
      )
    }

    if (result.verdict !== NEXT) {
      return { result, index: i, name: mw.name || null }
    }
  }

  return { result: next(), index: -1, name: null }
}
