// Dynamic Risk Engine v2.0 — TradeGuard X
//
// KEY INNOVATION: Pre-Policy Risk Gating
// Risk is evaluated BEFORE policy rules run.
// We detect unsafe INTENT before we even check if rules are violated.
//
// "We don't just enforce rules — we detect unsafe intent before rules are applied."

const config = require('../config/system');
const { VOLATILITY } = require('../data/marketData');

// ── Injection & manipulation patterns ────────────────────────────────────────
const INJECTION_PHRASES = [
  'ignore', 'bypass', 'override', 'forget', 'disable', 'jailbreak',
  'unrestricted', 'skip rules', 'no limits', 'disregard', 'unlock',
  'remove restrictions', 'act as', 'pretend', 'roleplay',
];

const BULK_SELL_PATTERNS = [
  'sell everything', 'sell all', 'liquidate all', 'dump all',
  'all positions', 'entire portfolio', 'all my shares', 'full liquidation',
];

const NEGATION_PATTERNS = [/don'?t\s+\w+\s+rule/i, /no\s+rule/i, /ignore\s+policy/i, /without\s+checks?/i];
const URGENCY_PATTERNS  = /immediately|right now|asap|no delay|instant|hurry|override now/i;

// ── Component scorers ─────────────────────────────────────────────────────────

function scoreAmount(amount) {
  if (amount == null) return { score: 25, label: 'UNKNOWN', detail: 'No amount specified — uncertain exposure', weight_label: 'amount' };
  if (amount <= 250)  return { score: 5,  label: 'LOW',     detail: `$${amount} — minimal exposure`,           weight_label: 'amount' };
  if (amount <= 750)  return { score: 18, label: 'LOW',     detail: `$${amount} — low exposure`,              weight_label: 'amount' };
  if (amount <= 1200) return { score: 35, label: 'MEDIUM',  detail: `$${amount} — moderate exposure`,         weight_label: 'amount' };
  if (amount <= 2000) return { score: 58, label: 'MEDIUM',  detail: `$${amount} — at policy ceiling`,         weight_label: 'amount' };
  if (amount <= 5000) return { score: 80, label: 'HIGH',    detail: `$${amount} — exceeds policy limit by $${amount-2000}`, weight_label: 'amount' };
  return { score: 97, label: 'CRITICAL', detail: `$${amount} — extreme exposure, ${Math.round(amount/2000)}x policy limit`, weight_label: 'amount' };
}

function scoreTicker(ticker) {
  if (!ticker) return { score: 45, label: 'UNKNOWN', detail: 'No ticker — cannot assess asset risk', weight_label: 'ticker' };
  const whitelist = config.intent.allowed_tickers;
  const vol       = VOLATILITY[ticker] || 80;
  const onList    = whitelist.includes(ticker);
  let base = vol;
  if (!onList) base = Math.min(base + 30, 100); // non-whitelisted adds risk
  const label = base <= 20 ? 'LOW' : base <= 40 ? 'MEDIUM' : base <= 65 ? 'HIGH' : 'CRITICAL';
  const detail = `${ticker}: vol=${vol}, whitelist=${onList ? 'YES' : 'NO'}`;
  return { score: base, label, detail, whitelisted: onList, volatility: vol, weight_label: 'ticker' };
}

function scoreVolatilityExposure(ticker, amount) {
  const vol = VOLATILITY[ticker] || 80;
  const exposure = amount || 500;
  // Exposure-weighted volatility score
  const raw = (vol / 100) * Math.log(exposure / 100 + 1) * 35;
  const score = Math.min(Math.round(raw), 100);
  const label = score <= 15 ? 'LOW' : score <= 35 ? 'MEDIUM' : score <= 60 ? 'HIGH' : 'CRITICAL';
  return {
    score, label, weight_label: 'volatility',
    detail: `${ticker||'UNKNOWN'} vol=${vol}%, exposure=$${exposure} → weighted score ${score}`,
  };
}

function scoreInstruction(rawText) {
  const lc = rawText.toLowerCase();
  let score = 0;
  const flags = [];

  // Injection phrase detection
  for (const phrase of INJECTION_PHRASES) {
    if (lc.includes(phrase)) {
      score += config.risk.injection_phrase_score;
      flags.push({ type: 'INJECTION', text: phrase, severity: 'CRITICAL' });
    }
  }

  // Bulk sell detection
  for (const phrase of BULK_SELL_PATTERNS) {
    if (lc.includes(phrase)) {
      score += 35;
      flags.push({ type: 'BULK_SELL', text: phrase, severity: 'HIGH' });
    }
  }

  // Negation patterns
  for (const pat of NEGATION_PATTERNS) {
    if (pat.test(lc)) {
      score += config.risk.negation_score;
      flags.push({ type: 'NEGATION', text: 'Policy negation attempt', severity: 'CRITICAL' });
    }
  }

  // Urgency manipulation
  if (URGENCY_PATTERNS.test(lc)) {
    score += config.risk.urgency_score;
    flags.push({ type: 'URGENCY', text: 'Urgency/pressure language', severity: 'MEDIUM' });
  }

  // All-caps check (aggressive injection signal)
  const upperRatio = (rawText.match(/[A-Z]/g) || []).length / rawText.length;
  if (upperRatio > 0.5 && rawText.length > 5) {
    score += 10;
    flags.push({ type: 'SHOUTING', text: 'Aggressive all-caps instruction', severity: 'LOW' });
  }

  score = Math.min(score, 100);
  const clean = score === 0;
  const label = clean ? 'CLEAN' : score < 35 ? 'SUSPICIOUS' : score < 65 ? 'ELEVATED' : 'MALICIOUS';

  return {
    score, label, weight_label: 'instruction',
    flags: flags.length ? flags : [{ type: 'CLEAN', text: 'No threats detected', severity: 'NONE' }],
    injection_detected:  flags.some(f => f.type === 'INJECTION'),
    bulk_sell_detected:  flags.some(f => f.type === 'BULK_SELL'),
    detail: clean ? 'Instruction appears legitimate' : `${flags.length} threat(s) detected`,
  };
}

// ── Overall risk aggregation ──────────────────────────────────────────────────

function aggregateRisk(components) {
  const w = config.risk.weights;
  const weighted =
    components.amount.score      * w.amount      +
    components.ticker.score      * w.ticker      +
    components.volatility.score  * w.volatility  +
    components.instruction.score * w.instruction;
  const overall = Math.round(weighted);

  let level;
  for (const [lv, cfg] of Object.entries(config.risk.levels)) {
    if (overall <= cfg.max) { level = lv; break; }
  }
  level = level || 'CRITICAL';

  const levelCfg = config.risk.levels[level];
  return {
    score:       overall,
    level,
    color:       levelCfg.color,
    should_block: levelCfg.block,
    // Pre-policy gate: block if score exceeds threshold even if rules would pass
    pre_policy_block: overall >= config.risk.pre_policy_block_threshold,
    breakdown: {
      amount_contribution:      Math.round(components.amount.score * w.amount),
      ticker_contribution:      Math.round(components.ticker.score * w.ticker),
      volatility_contribution:  Math.round(components.volatility.score * w.volatility),
      instruction_contribution: Math.round(components.instruction.score * w.instruction),
    },
  };
}

// ── Pre-Policy Gate (THE CORE INNOVATION) ────────────────────────────────────
// This runs BEFORE policy rules — detects unsafe intent at the signal level.
// Even a "valid" trade can be blocked here if the intent signals are dangerous.

function runPrePolicyGate(parsed, components, overall) {
  const threats = [];
  let gateBlock = false;

  // Threat 1: Injection detected in instruction component
  if (components.instruction.injection_detected) {
    gateBlock = true;
    threats.push({
      threat: 'PROMPT_INJECTION',
      severity: 'CRITICAL',
      reason: `Injection phrase(s) detected: [${components.instruction.flags.filter(f=>f.type==='INJECTION').map(f=>f.text).join(', ')}]`,
      innovation: 'Pre-policy gating blocks this before any rule is checked',
    });
  }

  // Threat 2: Bulk sell regardless of rule coverage
  if (parsed.bulk_sell_detected || components.instruction.bulk_sell_detected) {
    gateBlock = true;
    threats.push({
      threat: 'UNSAFE_BULK_ACTION',
      severity: 'CRITICAL',
      reason: 'Bulk sell/liquidate instruction — dangerous even if no explicit rule violated',
      innovation: 'This may not violate a specific policy rule — but risk engine blocks it anyway',
    });
  }

  // Threat 3: Raw score above pre-policy threshold
  if (overall.pre_policy_block) {
    gateBlock = true;
    threats.push({
      threat: 'RISK_SCORE_EXCEEDED',
      severity: 'CRITICAL',
      reason: `Risk score ${overall.score} exceeds pre-policy gate threshold of ${config.risk.pre_policy_block_threshold}`,
      innovation: 'Risk engine can block even when all policy rules would pass',
    });
  }

  // Threat 4: Instruction is clean but ticker is not whitelisted
  if (parsed.ticker && !config.intent.allowed_tickers.includes(parsed.ticker) && !components.instruction.injection_detected) {
    gateBlock = true;
    threats.push({
      threat: 'UNAUTHORIZED_TICKER',
      severity: 'HIGH',
      reason: `${parsed.ticker} is not in the authorized ticker whitelist`,
    });
  }

  return {
    gate: 'PRE_POLICY',
    passed: !gateBlock,
    blocked: gateBlock,
    threats,
    evaluated_at: new Date().toISOString(),
    note: gateBlock
      ? 'BLOCKED at pre-policy gate — policy rules not reached'
      : 'Pre-policy gate PASSED — proceeding to policy evaluation',
    innovation_label: 'Pre-Policy Risk Gating — stops unsafe intent before rules run',
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

function assessRisk(parsed) {
  const components = {
    amount:      scoreAmount(parsed.amount),
    ticker:      scoreTicker(parsed.ticker),
    volatility:  scoreVolatilityExposure(parsed.ticker, parsed.amount),
    instruction: scoreInstruction(parsed.raw || ''),
  };
  const overall         = aggregateRisk(components);
  const prePolicyGate   = runPrePolicyGate(parsed, components, overall);

  return {
    components,
    overall,
    pre_policy_gate:  prePolicyGate,
    assessed_at:      new Date().toISOString(),
    engine_version:   '2.0.0',
    key_innovation:   'Pre-policy risk gating: risk evaluated before policy rules',
  };
}

module.exports = { assessRisk };
