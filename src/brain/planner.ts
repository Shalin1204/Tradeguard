import { Mandate, AgentPlan } from "../types/types";

// ─── Mock Planner (no API key needed) ───────────────────────────────────────
function mockPlanner(mandate: Mandate): AgentPlan {
  const steps: string[] = ["check_price"];

  // Always add validate_policy
  steps.push("validate_policy");

  // Core trade step
  steps.push("place_order");

  // Always audit
  steps.push("log_audit");

  return { steps, mandate };
}

// ─── OpenAI Planner (optional, set USE_MOCK=false) ───────────────────────────
async function openAIPlanner(mandate: Mandate): Promise<AgentPlan> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = `
You are a financial trading AI agent planner.
User wants to: ${mandate.action} ${mandate.quantity} shares of ${mandate.symbol} at max price $${mandate.maxPrice}.

Generate a JSON step plan with ONLY these allowed steps:
- "check_price" (always first)
- "validate_policy" (always second)
- "place_order" (only if trade is intended)
- "log_audit" (always last)

Return ONLY valid JSON:
{"steps": ["check_price", "validate_policy", "place_order", "log_audit"]}
No markdown, no explanation.
  `.trim();

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_tokens: 100,
  });

  const raw = response.choices[0].message.content!;
  const parsed = JSON.parse(raw) as { steps: string[] };
  return { steps: parsed.steps, mandate };
}

// ─── Main Export ─────────────────────────────────────────────────────────────
export async function generatePlan(mandate: Mandate): Promise<AgentPlan> {
  const useMock = process.env.USE_MOCK !== "false";

  if (useMock) {
    console.log("🧠 [Brain] Using mock planner");
    return mockPlanner(mandate);
  }

  console.log("🧠 [Brain] Using OpenAI planner");
  return openAIPlanner(mandate);
}
