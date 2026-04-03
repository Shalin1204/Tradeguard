import { Mandate, PolicyConfig, PolicyRule, EnforcementResult } from "../types/types";
import policiesJson from "../config/policies.json";

const policies: PolicyConfig = policiesJson as PolicyConfig;

// ─── Individual rule evaluators ──────────────────────────────────────────────

function evaluateTradeLimit(
  step: string,
  mandate: Mandate,
  max: number
): EnforcementResult {
  if (step !== "place_order") {
    return { step, allowed: true, reason: "Not a trade step" };
  }
  if (mandate.maxPrice > max) {
    return {
      step,
      allowed: false,
      reason: `Trade limit exceeded: $${mandate.maxPrice} > $${max} max allowed`,
    };
  }
  return { step, allowed: true, reason: `Price $${mandate.maxPrice} within limit $${max}` };
}

function evaluateTickerWhitelist(
  step: string,
  mandate: Mandate,
  allowed: string[]
): EnforcementResult {
  if (step !== "place_order") {
    return { step, allowed: true, reason: "Not a trade step" };
  }
  if (!allowed.includes(mandate.symbol)) {
    return {
      step,
      allowed: false,
      reason: `Ticker ${mandate.symbol} not in whitelist: [${allowed.join(", ")}]`,
    };
  }
  return { step, allowed: true, reason: `Ticker ${mandate.symbol} is whitelisted` };
}

function evaluateMaxQuantity(
  step: string,
  mandate: Mandate,
  max: number
): EnforcementResult {
  if (step !== "place_order") {
    return { step, allowed: true, reason: "Not a trade step" };
  }
  if (mandate.quantity > max) {
    return {
      step,
      allowed: false,
      reason: `Quantity ${mandate.quantity} exceeds max ${max} shares per order`,
    };
  }
  return { step, allowed: true, reason: `Quantity ${mandate.quantity} within limit` };
}

// ─── Main policy evaluator ───────────────────────────────────────────────────
export function evaluatePolicies(
  step: string,
  mandate: Mandate
): EnforcementResult {
  for (const rule of policies.rules) {
    let result: EnforcementResult;

    switch (rule.type) {
      case "intent_token_required":
        // Already handled by enforcer.ts (JWT check)
        result = { step, allowed: true, reason: "Intent token verified" };
        break;

      case "trade_limit":
        result = evaluateTradeLimit(step, mandate, rule.max);
        break;

      case "ticker_whitelist":
        result = evaluateTickerWhitelist(step, mandate, rule.allowed);
        break;

      case "max_quantity":
        result = evaluateMaxQuantity(step, mandate, rule.max);
        break;

      default:
        result = { step, allowed: true, reason: "Unknown rule — skip" };
    }

    // Fail-closed: first block wins
    if (!result.allowed) return result;
  }

  return { step, allowed: true, reason: "All policies passed" };
}
