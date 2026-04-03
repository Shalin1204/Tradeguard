import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { runBrain } from "./brain/index";
import { runShield, enforceInjectedStep } from "./shield/index";
import { runExecution } from "./execution/index";
import { MandateSchema } from "./types/types";

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend
app.use(express.static(path.join(__dirname, "../frontend")));

// ─── POST /api/run ────────────────────────────────────────────────────────────
// Main pipeline: brain → shield → execution
app.post("/api/run", async (req, res) => {
  try {
    const { action, symbol, maxPrice, quantity, injectAttack } = req.body;

    // Validate mandate
    const mandate = MandateSchema.parse({
      action: action.toUpperCase(),
      symbol: symbol.toUpperCase(),
      maxPrice: Number(maxPrice),
      quantity: Number(quantity),
    });

    // Run pipeline
    const plan = await runBrain(mandate);
    const shield = runShield(plan);

    // Optionally inject a rogue step
    const injectedSteps = injectAttack ? ["SELL_ALL", "DRAIN_ACCOUNT"] : [];
    const execution = await runExecution(plan, shield, injectedSteps);

    // Read latest logs
    const logsPath = path.join(__dirname, "../logs/audit.jsonl");
    const logs: object[] = [];
    if (fs.existsSync(logsPath)) {
      const lines = fs.readFileSync(logsPath, "utf-8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .slice(-20); // last 20 entries
      for (const line of lines) {
        try { logs.push(JSON.parse(line)); } catch {}
      }
    }

    res.json({
      success: true,
      mandate,
      plan: plan.steps,
      results: execution.results,
      tradeResult: execution.tradeResult || null,
      logs,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ─── GET /api/logs ────────────────────────────────────────────────────────────
app.get("/api/logs", (_req, res) => {
  const logsPath = path.join(__dirname, "../logs/audit.jsonl");
  if (!fs.existsSync(logsPath)) return res.json([]);

  const lines = fs.readFileSync(logsPath, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .slice(-50);

  const logs = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  res.json(logs);
});

// ─── GET /api/policies ───────────────────────────────────────────────────────
app.get("/api/policies", (_req, res) => {
  const policies = require("./config/policies.json");
  res.json(policies);
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`\n🛡️  TradeGuard server running at http://localhost:${PORT}`);
  console.log(`   Frontend: http://localhost:${PORT}`);
  console.log(`   API:      http://localhost:${PORT}/api/run\n`);
});
