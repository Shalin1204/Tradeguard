import { Mandate, MandateSchema, AgentPlan } from "../types/types";
import { generatePlan } from "./planner";

export async function runBrain(rawInput: unknown): Promise<AgentPlan> {
  // Validate and parse user mandate with Zod
  const mandate: Mandate = MandateSchema.parse(rawInput);
  console.log("[Brain] Mandate validated:", mandate);

  // Generate agent plan
  const plan = await generatePlan(mandate);
  console.log("[Brain] Plan generated:", plan.steps);

  return plan;
}
