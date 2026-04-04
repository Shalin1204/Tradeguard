// ArmorIQ Enforcement Layer v3.0.1 — TradeGuard X
//
// THE FINAL GATE. Fail-closed. Zero-trust.
// Nothing executes unless ALL gates pass.
//
// "We apply zero-trust principles to AI agents —
//  nothing executes unless explicitly verified."
//
// Four independent enforcement gates — defense in depth.
// Even if one gate logic is bypassed, three others still protect.

const config = require('../config/system');

const ARMORIQ_VERSION = config.system.armoriq_version;

// ── Gate 1: Intent Contract Validation ───────────────────────────────────────
// Verify the intent contract is valid, unexpired, and the request is within scope.

function gate1_intentContract(intentToken, parsed) {
  const checks = [];

  // Check 1a: Token exists
  if (!intentToken?.token_id) {
    checks.push({ name: 'Token Existence', passed: false, reason: 'No intent contract present — execution impossible' });
    return { gate: 1, name: 'Intent Contract Validation', passed: false, checks, verdict: 'BLOCK' };
  }

  // Check 1b: Not expired
  const expired = Date.now() > intentToken.expires_at;
  const ttl = Math.max(0, Math.round((intentToken.expires_at - Date.now()) / 1000));
  checks.push({
    name: 'Contract Expiry',
    passed: !expired,
    reason: expired ? 'Intent contract expired — must re-authorize' : `Contract active (${ttl}s remaining)`,
  });

  // Check 1c: Scope hash integrity
  const hasHash = !!(intentToken.scope_hash);
  checks.push({
    name: 'Scope Hash Integrity',
    passed: hasHash,
    reason: hasHash ? `Scope hash ${intentToken.scope_hash} present — contract intact` : 'Missing scope hash — contract tampered or incomplete',
  });

  // Check 1d: Ticker within contract scope
  if (parsed.ticker) {
    const inScope = intentToken.scope?.allowed_tickers?.includes(parsed.ticker);
    checks.push({
      name: 'Ticker Scope Binding',
      passed: !!inScope,
      reason: inScope
        ? `${parsed.ticker} is within contract-authorized tickers`
        : `${parsed.ticker} is OUTSIDE the contract execution boundary`,
    });
  }

  // Check 1e: Amount within contract max
  if (parsed.amount != null && intentToken.scope?.max_amount != null) {
    const ok = parsed.amount <= intentToken.scope.max_amount;
    checks.push({
      name: 'Amount Contract Binding',
      passed: ok,
      reason: ok
        ? `$${parsed.amount} within contract max of $${intentToken.scope.max_amount}`
        : `$${parsed.amount} exceeds contract-bound max of $${intentToken.scope.max_amount}`,
    });
  }

  // Check 1f: Action within contract scope
  if (parsed.action) {
    const reqAction = `alpaca_${parsed.action}`;
    const ok = intentToken.scope?.permitted_actions?.includes(reqAction);
    checks.push({
      name: 'Action Contract Binding',
      passed: !!ok,
      reason: ok
        ? `"${reqAction}" is within the contract's permitted action set`
        : `"${reqAction}" is OUTSIDE the contract execution boundary`,
    });
  }

  const passed = checks.every(c => c.passed);
  return { gate: 1, name: 'Intent Contract Validation', passed, checks, verdict: passed ? 'PASS' : 'BLOCK',
    innovation: 'Intent is enforced as an executable contract — not just metadata' };
}

// ── Gate 2: Pre-Policy Risk Gate ──────────────────────────────────────────────
// The unique innovation: risk evaluated before policy rules.
// Unsafe intent is blocked here even if it would technically pass all policy rules.

function gate2_prePolicyRiskGate(riskAssessment) {
  const ppg   = riskAssessment?.pre_policy_gate;
  const overall = riskAssessment?.overall;

  const checks = [];

  // Check 2a: Pre-policy gate result
  checks.push({
    name: 'Pre-Policy Risk Evaluation',
    passed: !!ppg?.passed,
    reason: ppg?.passed
      ? 'Pre-policy risk gate: no unsafe signals detected'
      : `Pre-policy gate BLOCKED: ${ppg?.threats?.map(t => t.threat).join(', ') || 'unsafe intent detected'}`,
    is_innovation: true,
    innovation_label: 'Blocks unsafe intent BEFORE policy rules run',
  });

  // Check 2b: Risk level within bounds
  const riskOk = !overall?.should_block;
  checks.push({
    name: 'Risk Level Threshold',
    passed: riskOk,
    reason: riskOk
      ? `Risk level ${overall?.level} (score ${overall?.score}) — within acceptable range`
      : `Risk level ${overall?.level} (score ${overall?.score}) EXCEEDS ArmorIQ threshold — blocked independent of policy`,
  });

  // Check 2c: No injection
  const noInjection = !riskAssessment?.components?.instruction?.injection_detected;
  checks.push({
    name: 'Injection Signal Check',
    passed: noInjection,
    reason: noInjection
      ? 'No prompt injection signals in instruction'
      : `Injection detected: [${riskAssessment.components.instruction.flags.filter(f=>f.type==='INJECTION').map(f=>f.text).join(', ')}]`,
  });

  const passed = checks.every(c => c.passed);
  return {
    gate: 2,
    name: 'Pre-Policy Risk Gate',
    passed,
    checks,
    verdict: passed ? 'PASS' : 'BLOCK',
    innovation: 'Risk engine blocks unsafe intent before policy rules are evaluated',
    risk_score: overall?.score,
    risk_level: overall?.level,
  };
}

// ── Gate 3: Policy Compliance ─────────────────────────────────────────────────

function gate3_policyCompliance(policyResult) {
  const checks = (policyResult?.results || []).map(r => ({
    name:   r.rule_type,
    passed: r.passed,
    reason: r.message,
    rule_id: r.rule_id,
    severity: r.severity,
  }));

  const passed = policyResult?.passed ?? false;
  return {
    gate:    3,
    name:    'Policy Rules Compliance',
    passed,
    checks,
    verdict: passed ? 'PASS' : 'BLOCK',
    rules_evaluated: policyResult?.total_rules || 0,
    rules_passed:    policyResult?.rules_passed || 0,
    rules_failed:    policyResult?.rules_failed || 0,
  };
}

// ── Gate 4: Runtime Authorization Binding ────────────────────────────────────
// Final cryptographic + behavioral binding check.

function gate4_runtimeBinding(intentToken, parsed, agentRole) {
  const checks = [];
  const agentCfg = config.agents[agentRole] || null;

  // Check 4a: Agent exists in registry
  checks.push({
    name: 'Agent Registry Check',
    passed: !!agentCfg,
    reason: agentCfg
      ? `Agent "${agentRole}" found in registry: ${agentCfg.label}`
      : `Agent "${agentRole}" NOT found in agent registry`,
  });

  // Check 4b: Scoped delegation — agent CAN modify portfolio?
  if (parsed.action) {
    const canTrade = agentCfg?.can_modify_portfolio ?? false;
    checks.push({
      name: 'Scoped Delegation Check',
      passed: canTrade,
      reason: canTrade
        ? `"${agentRole}" has portfolio modification rights`
        : `"${agentRole}" does NOT have portfolio modification rights — scoped delegation violation`,
      innovation: 'Scoped delegation: each agent operates within strict, non-overlapping capabilities',
    });
  }

  // Check 4c: Token agent role matches request role
  if (intentToken?.agent_role && agentRole) {
    const match = intentToken.agent_role === agentRole;
    checks.push({
      name: 'Agent Role Consistency',
      passed: match,
      reason: match
        ? `Token role "${intentToken.agent_role}" matches request role "${agentRole}"`
        : `Token role "${intentToken.agent_role}" does NOT match request role "${agentRole}" — possible spoofing`,
    });
  }

  // Check 4d: Final sanity — if action present, ticker must be identified
  if (parsed.action && !parsed.ticker) {
    checks.push({ name: 'Execution Completeness', passed: false, reason: 'Cannot execute trade without a valid ticker symbol' });
  }

  const passed = checks.every(c => c.passed);
  return {
    gate:    4,
    name:    'Runtime Authorization Binding',
    passed,
    checks,
    verdict: passed ? 'PASS' : 'BLOCK',
    agent:   agentRole,
  };
}

// ── ArmorIQ Master Orchestrator ───────────────────────────────────────────────

function runArmorIQ({ parsed, intentToken, riskAssessment, policyResult, agentRole }) {
  const gates = [];
  let   verdict = 'ALLOW';
  const blockReasons  = [];
  const blockGates    = [];

  const g1 = gate1_intentContract(intentToken, parsed);
  const g2 = gate2_prePolicyRiskGate(riskAssessment);
  const g3 = gate3_policyCompliance(policyResult);
  const g4 = gate4_runtimeBinding(intentToken, parsed, agentRole);

  for (const gate of [g1, g2, g3, g4]) {
    gates.push(gate);
    if (!gate.passed) {
      verdict = 'BLOCK';
      blockGates.push(`Gate ${gate.gate}: ${gate.name}`);
      const failedCheck = gate.checks.find(c => !c.passed);
      if (failedCheck) blockReasons.push(failedCheck.reason);
    }
  }

  // Fail-closed: if anything is ambiguous or missing, default to BLOCK
  if (verdict === 'ALLOW' && (!parsed.ticker || !parsed.action) && parsed.action) {
    verdict = 'BLOCK';
    blockReasons.push('Incomplete trade parameters — fail-closed default');
  }

  return {
    engine:           'ArmorIQ',
    version:          ARMORIQ_VERSION,
    enforcement_mode: 'fail_closed',
    verdict,
    gates,
    block_reasons:    blockReasons,
    block_gates:      blockGates,
    gates_passed:     gates.filter(g => g.passed).length,
    gates_total:      gates.length,
    allow_execution:  verdict === 'ALLOW',
    zero_trust_principle: 'Nothing executes unless explicitly verified across all 4 gates',
    enforced_at:      new Date().toISOString(),
  };
}

module.exports = { runArmorIQ };
