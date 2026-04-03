import { decodeIntentToken } from "./tokenizer";
import { evaluatePolicies } from "../policy/engine";
import { EnforcementResult, Mandate } from "../types/types";
import { logger } from "../logger/logger";

export function enforce(
  step: string,
  token: string,
  mandate: Mandate
): EnforcementResult {
  // ── 1. Verify JWT token ────────────────────────────────────────────────────
  let approvedSteps: string[];
  try {
    const decoded = decodeIntentToken(token);
    approvedSteps = decoded.approvedSteps;
  } catch (err: any) {
    const result: EnforcementResult = {
      step,
      allowed: false,
      reason: `Invalid or expired intent token: ${err.message}`,
    };
    logResult(result, mandate.symbol);
    return result;
  }

  // ── 2. Check step is in approved list ──────────────────────────────────────
  if (!approvedSteps.includes(step)) {
    const result: EnforcementResult = {
      step,
      allowed: false,
      reason: `Step "${step}" not in intent token — possible injection attack`,
    };
    logResult(result, mandate.symbol);
    return result;
  }

  // ── 3. Evaluate policy rules ───────────────────────────────────────────────
  const policyResult = evaluatePolicies(step, mandate);
  if (!policyResult.allowed) {
    const result: EnforcementResult = {
      step,
      allowed: false,
      reason: policyResult.reason,
    };
    logResult(result, mandate.symbol);
    return result;
  }

  // ── 4. All checks passed → ALLOW ──────────────────────────────────────────
  const result: EnforcementResult = {
    step,
    allowed: true,
    reason: "All checks passed",
  };
  logResult(result, mandate.symbol);
  return result;
}

function logResult(result: EnforcementResult, symbol: string): void {
  logger.info(`${result.step}`, {
    step: result.step,
    status: result.allowed ? "ALLOWED" : "BLOCKED",
    reason: result.reason,
    symbol,
    timestamp: new Date().toISOString(),
  });
}
