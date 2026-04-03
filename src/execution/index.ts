import { AgentPlan, EnforcementResult, TradeResult } from "../types/types";
import { executeTrade } from "./trader";
import { Shield } from "../shield/index";

export interface ExecutionResult {
  results: EnforcementResult[];
  tradeResult?: TradeResult;
}

export async function runExecution(
  plan: AgentPlan,
  shield: Shield,
  injectedSteps: string[] = [] // for attack simulation
): Promise<ExecutionResult> {
  const results: EnforcementResult[] = [];
  let tradeResult: TradeResult | undefined;

  // Include any injected steps in the loop to demonstrate blocking
  const allSteps = [...plan.steps, ...injectedSteps];

  for (const step of allSteps) {
    const enforcement = shield.enforce(step);
    results.push(enforcement);

    console.log(
      `${enforcement.allowed ? "✅" : "🚫"} [Execution] ${step} → ${
        enforcement.allowed ? "ALLOWED" : "BLOCKED"
      } | ${enforcement.reason}`
    );

    // Only execute trade if step is allowed AND it's the place_order step
    if (enforcement.allowed && step === "place_order") {
      tradeResult = await executeTrade(
        plan.mandate.symbol,
        plan.mandate.quantity,
        plan.mandate.action
      );
      console.log("💰 [Execution] Trade executed:", tradeResult);
    }
  }

  return { results, tradeResult };
}
