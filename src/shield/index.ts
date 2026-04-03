import { issueIntentToken } from "./tokenizer";
import { enforce } from "./enforcer";
import { AgentPlan, EnforcementResult, Mandate } from "../types/types";

export interface Shield {
  token: string;
  enforce: (step: string) => EnforcementResult;
}

export function runShield(plan: AgentPlan): Shield {
  // Issue JWT with ONLY the approved steps from the plan
  const token = issueIntentToken(plan.steps, plan.mandate);
  console.log("🔐 [Shield] Intent Token issued for steps:", plan.steps);

  return {
    token,
    enforce: (step: string) => enforce(step, token, plan.mandate),
  };
}

// For injection attack simulation — enforce a foreign step against real token
export function enforceInjectedStep(
  injectedStep: string,
  shield: Shield,
  mandate: Mandate
): EnforcementResult {
  return enforce(injectedStep, shield.token, mandate);
}
