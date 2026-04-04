// OpenClaw Intent Parser v1.4.0 — TradeGuard X
// Converts natural language into a STRICT executable intent contract.
// "Intent is not interpreted — it is enforced as a contract at execution time."

const crypto = require('crypto');
const config = require('../config/system');

const TICKER_MAP = {
  apple: 'AAPL', aapl: 'AAPL',
  microsoft: 'MSFT', msft: 'MSFT',
  google: 'GOOGL', googl: 'GOOGL', alphabet: 'GOOGL',
  amazon: 'AMZN', amzn: 'AMZN',
  nvidia: 'NVDA', nvda: 'NVDA',
  tesla: 'TSLA', tsla: 'TSLA',
  meta: 'META', facebook: 'META',
  netflix: 'NFLX', nflx: 'NFLX',
  amd: 'AMD',
  jpmorgan: 'JPM', jpm: 'JPM',
};

const BUY_WORDS  = ['buy', 'purchase', 'acquire', 'long', 'get', 'invest in', 'take', 'pick up'];
const SELL_WORDS = ['sell', 'dump', 'short', 'offload', 'liquidate', 'exit', 'close'];

function extractAmount(text) {
  const patterns = [
    /\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/,
    /([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)\s*(?:dollars?|usd)/i,
    /worth\s+(?:of\s+)?\$?\s*([0-9,]+)/i,
    /(?:for|at)\s+\$?\s*([0-9,]+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseFloat(m[1].replace(/,/g, ''));
  }
  return null;
}

function extractTicker(text) {
  const upper = text.match(/\b([A-Z]{2,5})\b/g) || [];
  const known = ['AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META','NFLX','AMD','JPM'];
  for (const t of upper) {
    if (known.includes(t)) return t;
  }
  const lc = text.toLowerCase();
  for (const [name, ticker] of Object.entries(TICKER_MAP)) {
    if (lc.includes(name)) return ticker;
  }
  return null;
}

function extractAction(text) {
  const lc = text.toLowerCase();
  if (BUY_WORDS.some(w => lc.includes(w)))  return 'buy';
  if (SELL_WORDS.some(w => lc.includes(w))) return 'sell';
  return null;
}

function extractQty(text) {
  const m = text.match(/(\d+)\s*(?:shares?|units?|stocks?)/i);
  return m ? parseInt(m[1]) : null;
}

function detectBulkSell(text) {
  const lc = text.toLowerCase();
  return ['sell everything','sell all','liquidate all','dump all','sell all my','all my shares','entire position'].some(p => lc.includes(p));
}

function detectUrgency(text) {
  return /immediately|right now|asap|no delay|instant|hurry|fast|quick/.test(text.toLowerCase());
}

function scoreConfidence(parsed) {
  let s = 0;
  if (parsed.ticker) s += 35;
  if (parsed.action) s += 30;
  if (parsed.amount) s += 25;
  if (parsed.qty)    s += 10;
  return s;
}

function generateIntentContract(parsed, agentRole) {
  const agentCfg = config.agents[agentRole] || config.agents.execution_agent;
  const now = Date.now();
  const scope = {
    action:            parsed.action ? `alpaca_${parsed.action}` : null,
    ticker:            parsed.ticker,
    max_amount:        Math.min(parsed.amount || config.intent.default_max_trade, agentCfg.max_trade_value || config.intent.default_max_trade),
    agent_role:        agentRole,
    permitted_actions: agentCfg.permitted_actions,
    allowed_tickers:   config.intent.allowed_tickers,
  };
  const scopeHash = crypto.createHash('sha256')
    .update(JSON.stringify(scope, Object.keys(scope).sort()))
    .digest('hex').slice(0, 24);

  return {
    token_id:    `TKN-${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
    schema_ver:  '2.0',
    issued_at:   now,
    expires_at:  now + config.intent.expiry_seconds * 1000,
    ttl_seconds: config.intent.expiry_seconds,
    agent_role:  agentRole,
    agent_label: agentCfg.label,
    scope,
    scope_hash:  scopeHash,
    requested: {
      raw_instruction: parsed.raw,
      action: parsed.action,
      ticker: parsed.ticker,
      amount: parsed.amount,
      qty:    parsed.qty,
    },
    parse_confidence:   scoreConfidence(parsed),
    bulk_sell_detected: parsed.bulk_sell_detected,
    urgency_detected:   parsed.urgency_detected,
    contract_valid:     true,
    contract_type:      'EXECUTION_SCOPE_v2',
  };
}

function buildPlan(parsed, agentRole) {
  const steps = [
    { step:1, agent:'research_agent',  action:'web_search',          description:`Fetch live quote & market data for ${parsed.ticker||'target'}`, read_only:true  },
    { step:2, agent:'risk_agent',      action:'analyze',             description:`Compute multi-dimensional risk score and volatility profile`,   read_only:true  },
    { step:3, agent:'risk_agent',      action:'pre_policy_risk_gate',description:`PRE-POLICY GATE — block unsafe intent before rules run`,        read_only:true, innovation:'pre_policy_gating' },
  ];
  if (parsed.action) {
    steps.push({ step:4, agent:'execution_agent', action:`alpaca_${parsed.action}`, description:`Execute ${parsed.action.toUpperCase()}: ${parsed.ticker||'?'} @ $${parsed.amount||'market'}`, read_only:false, requires_approval:true, gated_by:['L1','L2','L3','L4'] });
  }
  return steps;
}

function parseIntent(instruction, agentRole) {
  const text = instruction.trim();
  const parsed = {
    raw:                text,
    action:             extractAction(text),
    ticker:             extractTicker(text),
    amount:             extractAmount(text),
    qty:                extractQty(text),
    agent_role:         agentRole || 'execution_agent',
    bulk_sell_detected: detectBulkSell(text),
    urgency_detected:   detectUrgency(text),
  };
  const intentContract = generateIntentContract(parsed, agentRole || 'execution_agent');
  return {
    parsed,
    intentToken: intentContract,
    intentContract,
    plan: buildPlan(parsed, agentRole),
    openclaw_version: config.system.openclaw_version,
    parsed_at: new Date().toISOString(),
  };
}

module.exports = { parseIntent };
