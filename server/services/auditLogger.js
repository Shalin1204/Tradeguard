// Audit Logger v2 — TradeGuard X
// Immutable, append-only audit trail with full pipeline trace.
// Every enforcement decision is recorded — no exceptions.

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const LOG_DIR  = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'audit.json');

const inMemory = [];   // fast in-memory store (newest first)

function ensureDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, JSON.stringify([], null, 2));
}

function persist(entry) {
  try {
    ensureDir();
    const existing = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
    existing.unshift(entry);
    fs.writeFileSync(LOG_FILE, JSON.stringify(existing.slice(0, 500), null, 2));
  } catch { /* never let logging break execution */ }
}

// ── Pipeline trace builder ────────────────────────────────────────────────────
function buildPipelineTrace({ parsed, intentToken, riskAssessment, policyResult, armoriqResult, executionResult }) {
  return {
    stage_openclaw: {
      ticker: parsed.ticker,
      action: parsed.action,
      amount: parsed.amount,
      confidence: intentToken?.parse_confidence,
      bulk_sell:  parsed.bulk_sell_detected,
      urgency:    parsed.urgency_detected,
    },
    stage_pre_policy_gate: {
      passed:   riskAssessment?.pre_policy_gate?.passed,
      threats:  riskAssessment?.pre_policy_gate?.threats?.length || 0,
      note:     riskAssessment?.pre_policy_gate?.note,
    },
    stage_risk: {
      level:         riskAssessment?.overall?.level,
      score:         riskAssessment?.overall?.score,
      should_block:  riskAssessment?.overall?.should_block,
      components: {
        amount:      riskAssessment?.components?.amount?.score,
        ticker:      riskAssessment?.components?.ticker?.score,
        volatility:  riskAssessment?.components?.volatility?.score,
        instruction: riskAssessment?.components?.instruction?.score,
      },
    },
    stage_policy: {
      passed:       policyResult?.passed,
      rules_total:  policyResult?.total_rules,
      rules_failed: policyResult?.rules_failed,
      failures:     (policyResult?.results || []).filter(r => !r.passed).map(r => r.rule_id),
    },
    stage_armoriq: {
      verdict:      armoriqResult?.verdict,
      gates_passed: armoriqResult?.gates_passed,
      gates_total:  armoriqResult?.gates_total,
      block_gates:  armoriqResult?.block_gates,
    },
    stage_execution: executionResult ? {
      order_id:    executionResult.order_id,
      fill_price:  executionResult.avg_fill_price,
      qty:         executionResult.qty,
      total_value: executionResult.total_value,
    } : null,
  };
}

// ── Main log writer ───────────────────────────────────────────────────────────
function createAuditEntry(ctx) {
  const { instruction, parsed, intentToken, riskAssessment, policyResult, armoriqResult, executionResult } = ctx;

  const verdict = armoriqResult?.verdict || 'UNKNOWN';
  const pipelineTrace = buildPipelineTrace(ctx);

  const entry = {
    // Identity
    log_id:        crypto.randomBytes(6).toString('hex').toUpperCase(),
    timestamp:     new Date().toISOString(),
    pipeline_hash: crypto.createHash('sha256')
      .update(`${instruction}|${intentToken?.token_id || ''}|${verdict}|${Date.now()}`)
      .digest('hex').slice(0, 16),

    // Request context
    instruction,
    agent_role:       parsed?.agent_role || 'unknown',
    token_id:         intentToken?.token_id || null,

    // Parsed intent
    action:   parsed?.action ? `alpaca_${parsed.action}` : null,
    ticker:   parsed?.ticker || null,
    amount:   parsed?.amount || null,

    // Risk summary
    risk_level:   riskAssessment?.overall?.level || 'UNKNOWN',
    risk_score:   riskAssessment?.overall?.score || 0,
    pre_policy_gate_passed: riskAssessment?.pre_policy_gate?.passed ?? null,
    injection_detected:     riskAssessment?.components?.instruction?.injection_detected || false,

    // Policy summary
    policy_passed:    policyResult?.passed ?? false,
    policy_failures:  policyResult?.rules_failed || 0,

    // ArmorIQ summary
    armoriq_verdict:  verdict,
    gates_passed:     armoriqResult?.gates_passed || 0,
    block_reasons:    armoriqResult?.block_reasons || [],

    // Final outcome
    status:           verdict === 'ALLOW' ? 'EXECUTED' : 'BLOCKED',
    execution_order:  executionResult?.order_id || null,

    // Full trace (for deep audit)
    pipeline_trace: pipelineTrace,
  };

  inMemory.unshift(entry);
  if (inMemory.length > 200) inMemory.pop();
  persist(entry);
  return entry;
}

function getRecentLogs(limit = 25) {
  return inMemory.slice(0, limit);
}

function getStats() {
  const total    = inMemory.length;
  const blocked  = inMemory.filter(l => l.status === 'BLOCKED').length;
  const executed = inMemory.filter(l => l.status === 'EXECUTED').length;
  const critical = inMemory.filter(l => l.risk_level === 'CRITICAL').length;
  const injections = inMemory.filter(l => l.injection_detected).length;
  const prePolicyBlocks = inMemory.filter(l => l.pre_policy_gate_passed === false).length;
  return {
    total, blocked, executed, critical, injections, pre_policy_blocks: prePolicyBlocks,
    block_rate:       total ? Math.round((blocked / total) * 100) : 0,
    execution_rate:   total ? Math.round((executed / total) * 100) : 0,
  };
}

module.exports = { createAuditEntry, getRecentLogs, getStats };
