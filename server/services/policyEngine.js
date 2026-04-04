// Policy Engine v2.0 — TradeGuard X
// Pure JSON-driven evaluation — no business logic hardcoded in evaluators.
// All thresholds, lists, and patterns live in policy.json.
// "Rules are data, not code."

const fs   = require('fs');
const path = require('path');

let _policy = null;

function loadPolicy() {
  if (!_policy) {
    _policy = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'policy.json'), 'utf-8'));
  }
  return _policy;
}

// ── Pure rule evaluators (data-driven, no magic constants) ────────────────────

const EVALUATORS = {

  trade_limit(rule, ctx) {
    const amount = ctx.parsed?.amount;
    if (amount == null) return pass(rule, 'R001', 'No amount — not applicable');
    const ok = amount <= rule.max;
    return ok
      ? pass(rule, 'R001', `$${amount} is within limit of $${rule.max}`)
      : fail(rule, 'R001', `$${amount} EXCEEDS policy limit of $${rule.max} (overage: $${amount - rule.max})`);
  },

  ticker_whitelist(rule, ctx) {
    const ticker = ctx.parsed?.ticker;
    if (!ticker) return fail(rule, 'R002', 'No ticker identified — cannot verify whitelist');
    const ok = rule.allowed.includes(ticker);
    return ok
      ? pass(rule, 'R002', `${ticker} is on the approved whitelist`)
      : fail(rule, 'R002', `${ticker} is NOT on the approved whitelist. Allowed: [${rule.allowed.join(', ')}]`);
  },

  intent_token_required(rule, ctx) {
    const tk = ctx.intentToken;
    if (!tk?.token_id)          return fail(rule, 'R003', 'No intent token present');
    if (Date.now() > tk.expires_at) return fail(rule, 'R003', `Token ${tk.token_id} has expired`);
    if (!tk.scope_hash)         return fail(rule, 'R003', 'Token missing scope hash — contract invalid');
    const ttl = Math.round((tk.expires_at - Date.now()) / 1000);
    return pass(rule, 'R003', `Token ${tk.token_id} valid (expires in ${ttl}s)`);
  },

  action_whitelist(rule, ctx) {
    const action = ctx.parsed?.action ? `alpaca_${ctx.parsed.action}` : null;
    if (!action) return pass(rule, 'R004', 'No executable action in this request');
    const ok = rule.allowed.includes(action);
    return ok
      ? pass(rule, 'R004', `Action "${action}" is in the permitted action list`)
      : fail(rule, 'R004', `Action "${action}" is NOT permitted. Allowed: [${rule.allowed.join(', ')}]`);
  },

  prompt_injection_guard(rule, ctx) {
    const raw = (ctx.parsed?.raw || '').toLowerCase();
    const hits = rule.forbidden_patterns.filter(p => raw.includes(p));
    return hits.length === 0
      ? pass(rule, 'R005', 'No injection patterns detected in instruction')
      : fail(rule, 'R005', `PROMPT INJECTION: detected pattern(s) [${hits.join(', ')}]`);
  },

  role_enforcement(rule, ctx) {
    const role   = ctx.agentRole;
    const action = ctx.parsed?.action ? `alpaca_${ctx.parsed.action}` : null;
    if (!role || !action) return pass(rule, 'R006', 'No role/action pair to validate');
    const allowed = rule.roles[role] || [];
    const ok = allowed.includes(action);
    return ok
      ? pass(rule, 'R006', `Role "${role}" is authorized to perform "${action}"`)
      : fail(rule, 'R006', `ROLE VIOLATION: "${role}" cannot perform "${action}". Role permissions: [${allowed.join(', ') || 'none'}]`);
  },

  bulk_sell_guard(rule, ctx) {
    const raw  = (ctx.parsed?.raw || '').toLowerCase();
    const hits = rule.forbidden_phrases.filter(p => raw.includes(p));
    return hits.length === 0
      ? pass(rule, 'R007', 'No bulk/mass sell instruction detected')
      : fail(rule, 'R007', `BULK SELL BLOCKED: "${hits[0]}" is a forbidden instruction pattern`);
  },

  daily_trade_limit(rule, ctx) {
    const count = ctx.todayTradeCount || 0;
    const ok = count < rule.max_trades;
    return ok
      ? pass(rule, 'R008', `Daily trade count ${count}/${rule.max_trades} — within limit`)
      : fail(rule, 'R008', `Daily trade limit of ${rule.max_trades} reached (today: ${count})`);
  },

  max_position_size(rule, ctx) {
    const amount = ctx.parsed?.amount;
    if (!amount) return pass(rule, 'R009', 'No amount — not applicable');
    const pv = ctx.portfolioValue || 50000;
    const pct = (amount / pv) * 100;
    const ok = pct <= rule.max_pct;
    return ok
      ? pass(rule, 'R009', `Position size ${pct.toFixed(1)}% within ${rule.max_pct}% limit`)
      : fail(rule, 'R009', `Position size ${pct.toFixed(1)}% exceeds ${rule.max_pct}% portfolio limit`);
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function pass(rule, id, message) {
  return { passed: true,  rule_id: id, rule_type: rule.type, severity: rule.severity, description: rule.description, message };
}
function fail(rule, id, message) {
  return { passed: false, rule_id: id, rule_type: rule.type, severity: rule.severity, description: rule.description, message };
}

// ── Main evaluator ────────────────────────────────────────────────────────────

function evaluatePolicy(context) {
  const policy  = loadPolicy();
  const results = [];
  let   overall = true;
  const criticalFails = [];
  const highFails     = [];

  for (const rule of policy.rules) {
    const evaluator = EVALUATORS[rule.type];

    if (!evaluator) {
      // Fail-closed: unknown rule type = BLOCK
      const r = fail(rule, rule.id, `Unknown rule type "${rule.type}" — FAIL-CLOSED by default`);
      results.push(r);
      overall = false;
      continue;
    }

    const result = evaluator(rule, context);
    results.push(result);

    if (!result.passed) {
      overall = false;
      if (result.severity === 'CRITICAL') criticalFails.push(result);
      else if (result.severity === 'HIGH') highFails.push(result);
    }
  }

  return {
    passed:            overall,
    results,
    critical_failures: criticalFails,
    high_failures:     highFails,
    total_rules:       policy.rules.length,
    rules_passed:      results.filter(r => r.passed).length,
    rules_failed:      results.filter(r => !r.passed).length,
    policy_version:    policy.version,
    evaluated_at:      new Date().toISOString(),
    fail_closed:       true,
  };
}

function getPolicy() { return loadPolicy(); }
function reloadPolicy() { _policy = null; return loadPolicy(); }

module.exports = { evaluatePolicy, getPolicy, reloadPolicy };
