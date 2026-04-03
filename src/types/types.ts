import { z } from "zod";

// ─── Mandate ────────────────────────────────────────────────────────────────
export const MandateSchema = z.object({
  action: z.enum(["BUY", "SELL"]),
  symbol: z.string().toUpperCase(),
  maxPrice: z.number().positive(),
  quantity: z.number().positive().int(),
});
export type Mandate = z.infer<typeof MandateSchema>;

// ─── Agent Plan ──────────────────────────────────────────────────────────────
export interface AgentPlan {
  steps: string[];
  mandate: Mandate;
}

// ─── Intent Token Payload ────────────────────────────────────────────────────
export interface IntentTokenPayload {
  approvedSteps: string[];
  mandate: Mandate;
  iat?: number;
  exp?: number;
}

// ─── Enforcement Result ──────────────────────────────────────────────────────
export interface EnforcementResult {
  step: string;
  allowed: boolean;
  reason: string;
}

// ─── Policy Rule ─────────────────────────────────────────────────────────────
export interface TradeLimit {
  type: "trade_limit";
  max: number;
}
export interface TickerWhitelist {
  type: "ticker_whitelist";
  allowed: string[];
}
export interface IntentTokenRequired {
  type: "intent_token_required";
}
export interface MaxQuantity {
  type: "max_quantity";
  max: number;
}
export type PolicyRule = TradeLimit | TickerWhitelist | IntentTokenRequired | MaxQuantity;

export interface PolicyConfig {
  rules: PolicyRule[];
}

// ─── Log Entry ───────────────────────────────────────────────────────────────
export interface AuditLogEntry {
  step: string;
  status: "ALLOWED" | "BLOCKED";
  reason: string;
  symbol?: string;
  timestamp: string;
}

// ─── Trade Result ────────────────────────────────────────────────────────────
export interface TradeResult {
  orderId: string;
  symbol: string;
  qty: number;
  side: string;
  status: string;
  timestamp: string;
}
