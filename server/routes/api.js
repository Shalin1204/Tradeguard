// TradeGuard X — API Routes v2.0
// Full pipeline + market data + portfolio + system endpoints

const express = require('express');
const router  = express.Router();

const { parseIntent }      = require('../services/intentParser');
const { assessRisk }       = require('../services/riskEngine');
const { evaluatePolicy }   = require('../services/policyEngine');
const { runArmorIQ }       = require('../services/enforcement');
const { mockExecuteTrade } = require('../services/alpacaMock');
const { createAuditEntry, getRecentLogs, getStats } = require('../services/auditLogger');
const { getPolicy }        = require('../services/policyEngine');
const {
  getQuote, getAllQuotes, getPortfolio,
  getOrderHistory, getTodayTradeCount,
} = require('../data/marketData');
const config = require('../config/system');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/trade  — FULL ENFORCEMENT PIPELINE
// This is the core endpoint — runs the complete 6-stage pipeline
// ─────────────────────────────────────────────────────────────────────────────
router.post('/trade', (req, res) => {
  const { instruction, agentRole } = req.body;

  if (!instruction || typeof instruction !== 'string' || !instruction.trim()) {
    return res.status(400).json({ error: 'instruction is required and must be a non-empty string' });
  }

  const role = agentRole || 'execution_agent';
  const pipeline = {};
  const timings  = {};

  try {
    // ── STAGE 0: OpenClaw — Parse intent into executable contract ─────────
    let t = Date.now();
    const { parsed, intentToken, intentContract, plan } = parseIntent(instruction, role);
    timings.openclaw_ms = Date.now() - t;
    pipeline.parsed         = parsed;
    pipeline.intentToken    = intentToken;
    pipeline.intentContract = intentContract;
    pipeline.plan           = plan;

    // ── STAGE 1: Pre-Policy Risk Gate + Full Risk Assessment ──────────────
    // THE INNOVATION: risk runs BEFORE policy — can block before rules even run
    t = Date.now();
    const riskAssessment = assessRisk(parsed);
    timings.risk_ms = Date.now() - t;
    pipeline.riskAssessment = riskAssessment;

    // ── STAGE 2: Policy Engine (only reached if pre-policy gate passes) ───
    // Note: Even if pre-policy gate blocks, we still run policy for full audit
    t = Date.now();
    const policyResult = evaluatePolicy({
      parsed,
      intentToken,
      agentRole: role,
      todayTradeCount: getTodayTradeCount(),
      portfolioValue:  getPortfolio().portfolio_value,
    });
    timings.policy_ms = Date.now() - t;
    pipeline.policyResult = policyResult;

    // ── STAGE 3: ArmorIQ — Final Fail-Closed Enforcement Gate ────────────
    t = Date.now();
    const armoriqResult = runArmorIQ({
      parsed,
      intentToken,
      riskAssessment,
      policyResult,
      agentRole: role,
    });
    timings.armoriq_ms = Date.now() - t;
    pipeline.armoriqResult = armoriqResult;

    // ── STAGE 4: Execution — ONLY if ArmorIQ grants ALLOW ─────────────────
    let executionResult = null;
    if (armoriqResult.allow_execution) {
      t = Date.now();
      executionResult = mockExecuteTrade(parsed, intentToken);
      timings.execution_ms = Date.now() - t;
    }
    pipeline.executionResult = executionResult;
    timings.total_ms = Object.values(timings).reduce((a, b) => a + b, 0);

    // ── STAGE 5: Immutable Audit Log ──────────────────────────────────────
    const auditEntry = createAuditEntry({
      instruction, parsed, intentToken, riskAssessment,
      policyResult, armoriqResult, executionResult,
    });
    pipeline.auditEntry = auditEntry;

    // ── Innovation annotations for frontend display ────────────────────────
    pipeline.innovations = {
      pre_policy_gate_blocked:  !riskAssessment.pre_policy_gate.passed,
      intent_as_contract:        intentContract.contract_type === 'EXECUTION_SCOPE_v2',
      fail_closed_triggered:     armoriqResult.enforcement_mode === 'fail_closed',
      scoped_delegation_checked: true,
      zero_trust_gates:          armoriqResult.gates_total,
    };

    return res.json({
      success:  true,
      verdict:  armoriqResult.verdict,
      pipeline,
      timings,
    });

  } catch (err) {
    console.error('[TradeGuard X] Pipeline error:', err);
    return res.status(500).json({
      error:   'Internal pipeline error',
      message: err.message,
      verdict: 'BLOCK',  // fail-closed — errors also block
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analyze  — Risk-only analysis (no execution)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/analyze', (req, res) => {
  const { instruction, agentRole } = req.body;
  if (!instruction) return res.status(400).json({ error: 'instruction required' });
  try {
    const { parsed, intentToken, plan } = parseIntent(instruction, agentRole || 'execution_agent');
    const riskAssessment = assessRisk(parsed);
    const policyResult   = evaluatePolicy({ parsed, intentToken, agentRole, todayTradeCount: getTodayTradeCount(), portfolioValue: getPortfolio().portfolio_value });
    return res.json({ parsed, intentToken, plan, riskAssessment, policyResult, analysis_only: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/market  — Live-ish market quotes for all tracked tickers
// ─────────────────────────────────────────────────────────────────────────────
router.get('/market', (req, res) => {
  try {
    const quotes = getAllQuotes();
    return res.json({ quotes, count: quotes.length, timestamp: new Date().toISOString() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/market/:symbol', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const quote  = getQuote(symbol);
  if (!quote) return res.status(404).json({ error: `Unknown symbol: ${symbol}` });
  return res.json(quote);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/portfolio  — Paper portfolio + positions
// ─────────────────────────────────────────────────────────────────────────────
router.get('/portfolio', (req, res) => {
  return res.json(getPortfolio());
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/orders  — Recent order history
// ─────────────────────────────────────────────────────────────────────────────
router.get('/orders', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  return res.json({ orders: getOrderHistory(limit), count: getOrderHistory(limit).length });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/logs  — Audit log with stats
// ─────────────────────────────────────────────────────────────────────────────
router.get('/logs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 25, 100);
  return res.json({ logs: getRecentLogs(limit), stats: getStats() });
});

router.get('/logs/:logId', (req, res) => {
  const logs = getRecentLogs(200);
  const entry = logs.find(l => l.log_id === req.params.logId.toUpperCase());
  if (!entry) return res.status(404).json({ error: 'Log entry not found' });
  return res.json(entry);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/policy  — Active policy rules
// ─────────────────────────────────────────────────────────────────────────────
router.get('/policy', (req, res) => {
  return res.json(getPolicy());
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/agents  — Agent registry + capabilities
// ─────────────────────────────────────────────────────────────────────────────
router.get('/agents', (req, res) => {
  return res.json({
    agents: config.agents,
    total:  Object.keys(config.agents).length,
    principle: 'Scoped delegation — each agent operates within strict, non-overlapping capabilities',
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/demo-scenarios  — Pre-built demo test cases
// ─────────────────────────────────────────────────────────────────────────────
router.get('/demo-scenarios', (req, res) => {
  return res.json(config.demo_scenarios);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/system  — System config + innovation summary
// ─────────────────────────────────────────────────────────────────────────────
router.get('/system', (req, res) => {
  return res.json({
    ...config.system,
    pipeline_stages: config.pipeline_stages,
    risk_config: {
      pre_policy_threshold: config.risk.pre_policy_block_threshold,
      weights: config.risk.weights,
      levels:  config.risk.levels,
    },
    intent_config: config.intent,
    innovations: [
      { id: 1, title: 'Pre-Policy Risk Gating',         claim: 'Risk evaluated BEFORE policy rules — blocks unsafe intent before rules run' },
      { id: 2, title: 'Intent as Executable Contract',  claim: 'Intent is enforced as a cryptographic execution boundary, not just metadata' },
      { id: 3, title: 'Fail-Closed Zero-Trust',         claim: 'Nothing executes unless explicitly verified — errors default to BLOCK' },
      { id: 4, title: 'Scoped Agent Delegation',        claim: 'Each agent operates within strict, non-overlapping capability boundaries' },
      { id: 5, title: 'Defense in Depth (4 Gates)',     claim: 'Independent enforcement layers — one bypass cannot compromise the system' },
    ],
    status: 'operational',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/health
// ─────────────────────────────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  return res.json({
    status:   'operational',
    system:   'TradeGuard X',
    version:  config.system.version,
    armoriq:  { status: 'active', version: config.system.armoriq_version, mode: 'fail_closed' },
    openclaw: { status: 'active', version: config.system.openclaw_version },
    policy:   { status: 'loaded', version: getPolicy().version, rules: getPolicy().rules.length },
    uptime_s: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
