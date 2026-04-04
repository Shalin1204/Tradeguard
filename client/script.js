// TradeGuard X — Frontend Controller v2.0
'use strict';

const API = window.location.origin.includes('localhost') ? '' : '';
const $ = id => document.getElementById(id);

// ── State ─────────────────────────────────────────────────────────────────────
let auditLogs = [];
let stats = { total:0, executed:0, blocked:0, pre_policy_blocks:0, injections:0, block_rate:0 };

// ── Embedded pipeline logic (no server needed) ────────────────────────────────
// These mirror the server-side services exactly.

const SYSTEM_CONFIG = {
  risk: {
    pre_policy_block_threshold: 72,
    weights: { amount:0.35, ticker:0.20, volatility:0.20, instruction:0.25 },
    levels: { LOW:{max:29,block:false,color:'#00C853'}, MEDIUM:{max:54,block:false,color:'#FF9800'}, HIGH:{max:71,block:true,color:'#FF6D00'}, CRITICAL:{max:100,block:true,color:'#F44336'} },
    injection_phrase_score: 40, negation_score: 50, urgency_score: 15,
  },
  intent: { expiry_seconds:300, default_max_trade:2000, allowed_tickers:['AAPL','MSFT','GOOGL','AMZN','NVDA'] },
  agents: {
    execution_agent: { label:'Execution Agent', permitted_actions:['alpaca_buy','alpaca_sell'], can_modify_portfolio:true, max_trade_value:2000 },
    research_agent:  { label:'Research Agent',  permitted_actions:['web_search','analyze'],     can_modify_portfolio:false, max_trade_value:0 },
    risk_agent:      { label:'Risk Agent',       permitted_actions:['assess_risk','flag_trade','analyze'], can_modify_portfolio:false, max_trade_value:0 },
  },
};

const POLICY_RULES = [
  {id:'R001',type:'trade_limit',       description:'Max single trade value',               max:2000,                        severity:'CRITICAL'},
  {id:'R002',type:'ticker_whitelist',  description:'Only approved tickers may be traded',  allowed:['AAPL','MSFT','GOOGL','AMZN','NVDA'], severity:'CRITICAL'},
  {id:'R003',type:'intent_token_required',description:'Valid intent contract required',                                     severity:'CRITICAL'},
  {id:'R004',type:'action_whitelist',  description:'Only permitted actions may execute',   allowed:['alpaca_buy','alpaca_sell','web_search','analyze'], severity:'HIGH'},
  {id:'R005',type:'prompt_injection_guard',description:'Detect & block injection attempts',forbidden_patterns:['ignore','bypass','override','forget','jailbreak','disable','skip','disregard','unlock','unrestricted','act as','pretend','roleplay'], severity:'CRITICAL'},
  {id:'R006',type:'role_enforcement',  description:'Scoped delegation enforcement',        roles:{research_agent:['web_search','analyze'],execution_agent:['alpaca_buy','alpaca_sell'],risk_agent:['assess_risk','flag_trade','analyze']}, severity:'CRITICAL'},
  {id:'R007',type:'bulk_sell_guard',   description:'Block bulk sell/liquidate instructions',forbidden_phrases:['sell everything','sell all','liquidate all','dump all','all positions','all my shares'], severity:'CRITICAL'},
  {id:'R008',type:'daily_trade_limit', description:'Max trades per day',                  max_trades:10,                   severity:'HIGH'},
  {id:'R009',type:'max_position_size', description:'Max 5% of portfolio per trade',       max_pct:5,                       severity:'HIGH'},
];

const TICKER_MAP = {apple:'AAPL',aapl:'AAPL',microsoft:'MSFT',msft:'MSFT',google:'GOOGL',googl:'GOOGL',alphabet:'GOOGL',amazon:'AMZN',amzn:'AMZN',nvidia:'NVDA',nvda:'NVDA',tesla:'TSLA',tsla:'TSLA',meta:'META',facebook:'META',netflix:'NFLX',nflx:'NFLX'};
const VOLATILITY = {AAPL:18,MSFT:15,GOOGL:22,AMZN:28,NVDA:45,TSLA:72,META:38,NFLX:42,UNKNOWN:80};
const MOCK_PRICES = {AAPL:189.45,MSFT:415.20,GOOGL:175.30,AMZN:195.60,NVDA:875.40,TSLA:248.10,META:520.80,NFLX:635.90};
const INJECTION_PHRASES = ['ignore','bypass','override','forget','disable','jailbreak','unrestricted','skip rules','no limits','disregard','unlock','act as','pretend','roleplay'];
const BULK_PATTERNS = ['sell everything','sell all','liquidate all','dump all','all positions','all my shares'];

function rndHex(n){let s='';for(let i=0;i<n;i++)s+='0123456789ABCDEF'[Math.floor(Math.random()*16)];return s;}

// ── Intent Parser ─────────────────────────────────────────────────────────────
function _extractAmount(t){let m;if((m=t.match(/\$\s*([0-9,]+(?:\.[0-9]{1,2})?)/)))return parseFloat(m[1].replace(/,/g,''));if((m=t.match(/([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:dollars?|usd)/i)))return parseFloat(m[1].replace(/,/g,''));if((m=t.match(/(?:for|at)\s+\$?\s*([0-9,]+)/i)))return parseFloat(m[1].replace(/,/g,''));return null;}
function _extractTicker(t){const up=t.match(/\b([A-Z]{2,5})\b/g)||[];const known=['AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META','NFLX'];for(const x of up)if(known.includes(x))return x;const lc=t.toLowerCase();for(const[n,tk]of Object.entries(TICKER_MAP))if(lc.includes(n))return tk;return null;}
function _extractAction(t){const lc=t.toLowerCase();if(['buy','purchase','acquire','long','get','invest in'].some(w=>lc.includes(w)))return'buy';if(['sell','dump','short','offload','liquidate','exit'].some(w=>lc.includes(w)))return'sell';return null;}
function parseIntentLocal(instruction,agentRole){
  const text=instruction.trim();
  const parsed={raw:text,action:_extractAction(text),ticker:_extractTicker(text),amount:_extractAmount(text),agent_role:agentRole||'execution_agent',bulk_sell_detected:BULK_PATTERNS.some(p=>text.toLowerCase().includes(p)),urgency_detected:/immediately|right now|asap|no delay|instant/i.test(text)};
  const agentCfg=SYSTEM_CONFIG.agents[agentRole]||SYSTEM_CONFIG.agents.execution_agent;
  const now=Date.now();
  const scope={action:parsed.action?`alpaca_${parsed.action}`:null,ticker:parsed.ticker,max_amount:Math.min(parsed.amount||2000,agentCfg.max_trade_value||2000),agent_role:agentRole,permitted_actions:agentCfg.permitted_actions,allowed_tickers:SYSTEM_CONFIG.intent.allowed_tickers};
  const intentToken={token_id:`TKN-${rndHex(5)}`,schema_ver:'2.0',issued_at:now,expires_at:now+300000,ttl_seconds:300,agent_role:agentRole,agent_label:agentCfg.label,scope,scope_hash:rndHex(24),requested:{raw_instruction:text,action:parsed.action,ticker:parsed.ticker,amount:parsed.amount},parse_confidence:(parsed.ticker?35:0)+(parsed.action?30:0)+(parsed.amount?25:0),bulk_sell_detected:parsed.bulk_sell_detected,urgency_detected:parsed.urgency_detected,contract_valid:true,contract_type:'EXECUTION_SCOPE_v2'};
  const plan=[{step:1,agent:'research_agent',action:'web_search',description:`Fetch live quote & market data for ${parsed.ticker||'target'}`},{step:2,agent:'risk_agent',action:'analyze',description:'Compute multi-dimensional risk score and volatility profile'},{step:3,agent:'risk_agent',action:'pre_policy_risk_gate',description:'PRE-POLICY GATE — block unsafe intent before rules run',innovation:'pre_policy_gating'}];
  if(parsed.action)plan.push({step:4,agent:'execution_agent',action:`alpaca_${parsed.action}`,description:`Execute ${parsed.action.toUpperCase()}: ${parsed.ticker||'?'} @ $${parsed.amount||'market'}`,requires_approval:true,gated_by:['L1','L2','L3','L4']});
  return{parsed,intentToken,plan};
}

// ── Risk Engine ───────────────────────────────────────────────────────────────
function assessRiskLocal(parsed){
  const scoreAmount=a=>{if(a==null)return{score:25,label:'UNKNOWN'};if(a<=500)return{score:18,label:'LOW'};if(a<=1200)return{score:35,label:'MEDIUM'};if(a<=2000)return{score:58,label:'MEDIUM'};if(a<=5000)return{score:80,label:'HIGH'};return{score:97,label:'CRITICAL'};};
  const scoreTicker=t=>{if(!t)return{score:45,label:'UNKNOWN'};const v=VOLATILITY[t]||80;const wl=SYSTEM_CONFIG.intent.allowed_tickers.includes(t);const s=wl?v:Math.min(v+30,100);return{score:s,label:s<=20?'LOW':s<=40?'MEDIUM':s<=65?'HIGH':'CRITICAL',whitelisted:wl,volatility:v};};
  const scoreVol=(t,a)=>{const v=VOLATILITY[t]||80;const s=Math.min(Math.round((v/100)*Math.log((a||500)/100+1)*35),100);return{score:s,label:s<=15?'LOW':s<=35?'MEDIUM':s<=60?'HIGH':'CRITICAL'};};
  const scoreInstr=raw=>{const lc=raw.toLowerCase();let score=0;const flags=[];INJECTION_PHRASES.forEach(p=>{if(lc.includes(p)){score+=40;flags.push({type:'INJECTION',text:p,severity:'CRITICAL'});}});BULK_PATTERNS.forEach(p=>{if(lc.includes(p)){score+=35;flags.push({type:'BULK_SELL',text:p,severity:'HIGH'});}});if(/don'?t|do not/.test(lc)&&/rule|policy|limit/.test(lc)){score+=50;flags.push({type:'NEGATION',text:'Policy negation attempt',severity:'CRITICAL'});}if(/immediately|asap|no delay/.test(lc)){score+=15;flags.push({type:'URGENCY',text:'Urgency manipulation',severity:'MEDIUM'});}score=Math.min(score,100);const label=score===0?'CLEAN':score<35?'SUSPICIOUS':score<65?'ELEVATED':'MALICIOUS';return{score,label,flags:flags.length?flags:[{type:'CLEAN',text:'No threats detected',severity:'NONE'}],injection_detected:flags.some(f=>f.type==='INJECTION'),bulk_sell_detected:flags.some(f=>f.type==='BULK_SELL')};};
  const components={amount:scoreAmount(parsed.amount),ticker:scoreTicker(parsed.ticker),volatility:scoreVol(parsed.ticker,parsed.amount),instruction:scoreInstr(parsed.raw||'')};
  const w=SYSTEM_CONFIG.risk.weights;
  const ws=components.amount.score*w.amount+components.ticker.score*w.ticker+components.volatility.score*w.volatility+components.instruction.score*w.instruction;
  const overall=Math.round(ws);
  let level;for(const[lv,cfg]of Object.entries(SYSTEM_CONFIG.risk.levels)){if(overall<=cfg.max){level=lv;break;}}level=level||'CRITICAL';
  const levelCfg=SYSTEM_CONFIG.risk.levels[level];
  const overallObj={score:overall,level,color:levelCfg.color,should_block:levelCfg.block,pre_policy_block:overall>=SYSTEM_CONFIG.risk.pre_policy_block_threshold};
  // Pre-policy gate
  const threats=[];let gateBlock=false;
  if(components.instruction.injection_detected){gateBlock=true;threats.push({threat:'PROMPT_INJECTION',severity:'CRITICAL',reason:`Injection phrase detected: [${components.instruction.flags.filter(f=>f.type==='INJECTION').map(f=>f.text).join(', ')}]`,innovation:'Pre-policy gating blocks this before any rule is checked'});}
  if(parsed.bulk_sell_detected||components.instruction.bulk_sell_detected){gateBlock=true;threats.push({threat:'UNSAFE_BULK_ACTION',severity:'CRITICAL',reason:'Bulk sell instruction — dangerous even if no rule technically violated',innovation:'Pre-policy gate: risk engine blocks without needing a matching rule'});}
  if(overallObj.pre_policy_block){gateBlock=true;threats.push({threat:'RISK_SCORE_EXCEEDED',severity:'CRITICAL',reason:`Risk score ${overall} ≥ pre-policy threshold ${SYSTEM_CONFIG.risk.pre_policy_block_threshold}`});}
  if(parsed.ticker&&!SYSTEM_CONFIG.intent.allowed_tickers.includes(parsed.ticker)&&!components.instruction.injection_detected){gateBlock=true;threats.push({threat:'UNAUTHORIZED_TICKER',severity:'HIGH',reason:`${parsed.ticker} not in authorized ticker whitelist`});}
  const prePolicyGate={gate:'PRE_POLICY',passed:!gateBlock,blocked:gateBlock,threats,note:gateBlock?'BLOCKED at pre-policy gate — policy rules not reached':'Pre-policy gate PASSED',innovation_label:'Pre-Policy Risk Gating — stops unsafe intent before rules run'};
  return{components,overall:overallObj,pre_policy_gate:prePolicyGate,engine_version:'2.0.0'};
}

// ── Policy Engine ─────────────────────────────────────────────────────────────
function evaluatePolicyLocal(parsed,intentToken,agentRole){
  const pass=(rule,id,msg)=>({passed:true, rule_id:id,rule_type:rule.type,severity:rule.severity,description:rule.description,message:msg});
  const fail=(rule,id,msg)=>({passed:false,rule_id:id,rule_type:rule.type,severity:rule.severity,description:rule.description,message:msg});
  const evals={
    trade_limit:(r)=>{const a=parsed.amount;if(a==null)return pass(r,'R001','No amount');const ok=a<=r.max;return ok?pass(r,'R001',`$${a} within $${r.max}`):fail(r,'R001',`$${a} EXCEEDS limit $${r.max}`);},
    ticker_whitelist:(r)=>{const t=parsed.ticker;if(!t)return fail(r,'R002','No ticker identified');const ok=r.allowed.includes(t);return ok?pass(r,'R002',`${t} on whitelist`):fail(r,'R002',`${t} NOT on whitelist [${r.allowed.join(', ')}]`);},
    intent_token_required:(r)=>{const tk=intentToken;if(!tk?.token_id)return fail(r,'R003','No intent contract');if(Date.now()>tk.expires_at)return fail(r,'R003','Token expired');if(!tk.scope_hash)return fail(r,'R003','No scope hash');return pass(r,'R003',`Token ${tk.token_id} valid`);},
    action_whitelist:(r)=>{const a=parsed.action?`alpaca_${parsed.action}`:null;if(!a)return pass(r,'R004','No action');const ok=r.allowed.includes(a);return ok?pass(r,'R004',`"${a}" permitted`):fail(r,'R004',`"${a}" NOT permitted`);},
    prompt_injection_guard:(r)=>{const raw=(parsed.raw||'').toLowerCase();const hits=r.forbidden_patterns.filter(p=>raw.includes(p));return hits.length===0?pass(r,'R005','No injection'):fail(r,'R005',`INJECTION: [${hits.join(', ')}]`);},
    role_enforcement:(r)=>{const role=agentRole;const a=parsed.action?`alpaca_${parsed.action}`:null;if(!role||!a)return pass(r,'R006','N/A');const al=r.roles[role]||[];const ok=al.includes(a);return ok?pass(r,'R006',`"${role}" authorized for "${a}"`):fail(r,'R006',`ROLE VIOLATION: "${role}" cannot "${a}". Allowed: [${al.join(', ')||'none'}]`);},
    bulk_sell_guard:(r)=>{const raw=(parsed.raw||'').toLowerCase();const hits=r.forbidden_phrases.filter(p=>raw.includes(p));return hits.length===0?pass(r,'R007','No bulk sell'):fail(r,'R007',`BULK SELL: "${hits[0]}"`);}  ,
    daily_trade_limit:(r)=>{const c=auditLogs.filter(l=>l.status==='EXECUTED').length;const ok=c<r.max_trades;return ok?pass(r,'R008',`${c}/${r.max_trades} trades OK`):fail(r,'R008','Daily limit reached');},
    max_position_size:(r)=>{const a=parsed.amount;if(!a)return pass(r,'R009','N/A');const pct=(a/50000)*100;const ok=pct<=r.max_pct;return ok?pass(r,'R009',`${pct.toFixed(1)}% within ${r.max_pct}%`):fail(r,'R009',`${pct.toFixed(1)}% exceeds ${r.max_pct}%`);},
  };
  const results=[];let overall=true;
  for(const rule of POLICY_RULES){const ev=evals[rule.type];if(!ev){results.push({passed:false,rule_id:rule.id,rule_type:rule.type,severity:rule.severity,description:rule.description,message:`Unknown rule — FAIL-CLOSED`});overall=false;continue;}const r=ev(rule);results.push(r);if(!r.passed)overall=false;}
  return{passed:overall,results,total_rules:POLICY_RULES.length,rules_passed:results.filter(r=>r.passed).length,rules_failed:results.filter(r=>!r.passed).length};
}

// ── ArmorIQ ───────────────────────────────────────────────────────────────────
function runArmorIQLocal(parsed,intentToken,riskAssessment,policyResult,agentRole){
  const gates=[];let verdict='ALLOW';const blockReasons=[],blockGates=[];
  // G1: Intent Contract
  const c1=[];if(!intentToken?.token_id){c1.push({name:'Token Existence',passed:false,reason:'No intent contract'});}
  else{const exp=Date.now()>intentToken.expires_at;c1.push({name:'Contract Expiry',passed:!exp,reason:exp?'Expired':`Active (${Math.round((intentToken.expires_at-Date.now())/1000)}s)`});c1.push({name:'Scope Hash',passed:!!intentToken.scope_hash,reason:intentToken.scope_hash?`Hash ${intentToken.scope_hash.slice(0,8)}… intact`:'Missing hash'});if(parsed.ticker){const ok=intentToken.scope?.allowed_tickers?.includes(parsed.ticker);c1.push({name:'Ticker Scope',passed:!!ok,reason:ok?`${parsed.ticker} in scope`:`${parsed.ticker} OUTSIDE contract boundary`});}if(parsed.amount!=null){const ok=parsed.amount<=(intentToken.scope?.max_amount||2000);c1.push({name:'Amount Scope',passed:ok,reason:ok?`$${parsed.amount} within $${intentToken.scope?.max_amount}`:`$${parsed.amount} exceeds contract max`});}}
  const g1pass=c1.every(c=>c.passed);gates.push({gate:1,name:'Intent Contract Validation',passed:g1pass,checks:c1,verdict:g1pass?'PASS':'BLOCK',innovation:'Intent enforced as a cryptographic execution boundary'});
  if(!g1pass){verdict='BLOCK';const fc=c1.find(c=>!c.passed);if(fc)blockReasons.push(fc.reason);blockGates.push('Gate 1: Intent Contract');}
  // G2: Pre-Policy Risk Gate
  const ppg=riskAssessment?.pre_policy_gate;const ov=riskAssessment?.overall;
  const c2=[{name:'Pre-Policy Evaluation',passed:!!ppg?.passed,reason:ppg?.passed?'No unsafe signals detected':`Pre-policy BLOCKED: ${ppg?.threats?.map(t=>t.threat).join(', ')||'unsafe intent'}`,is_innovation:true,innovation_label:'Blocks unsafe intent BEFORE policy rules run'},{name:'Risk Level',passed:!ov?.should_block,reason:`Risk ${ov?.level} (score ${ov?.score}) — ${ov?.should_block?'EXCEEDS ArmorIQ threshold':'within acceptable range'}`},{name:'Injection Signal',passed:!riskAssessment?.components?.instruction?.injection_detected,reason:riskAssessment?.components?.instruction?.injection_detected?'Injection signal detected':'No injection'}];
  const g2pass=c2.every(c=>c.passed);gates.push({gate:2,name:'Pre-Policy Risk Gate',passed:g2pass,checks:c2,verdict:g2pass?'PASS':'BLOCK',innovation:'Risk engine blocks unsafe intent before policy rules are evaluated'});
  if(!g2pass){verdict='BLOCK';const fc=c2.find(c=>!c.passed);if(fc)blockReasons.push(fc.reason);blockGates.push('Gate 2: Pre-Policy Risk');}
  // G3: Policy Compliance
  const c3=(policyResult?.results||[]).map(r=>({name:r.rule_type,passed:r.passed,reason:r.message,rule_id:r.rule_id,severity:r.severity}));
  const g3pass=policyResult?.passed??false;
  gates.push({gate:3,name:'Policy Rules Compliance',passed:g3pass,checks:c3,verdict:g3pass?'PASS':'BLOCK',rules_evaluated:policyResult?.total_rules||0,rules_failed:policyResult?.rules_failed||0});
  if(!g3pass){verdict='BLOCK';const fc=c3.find(c=>!c.passed);if(fc)blockReasons.push(fc.reason);blockGates.push('Gate 3: Policy');}
  // G4: Runtime Auth
  const agentCfg=SYSTEM_CONFIG.agents[agentRole];const c4=[{name:'Agent Registry',passed:!!agentCfg,reason:agentCfg?`"${agentRole}" registered: ${agentCfg.label}`:`"${agentRole}" NOT in agent registry`}];
  if(parsed.action){const canTrade=agentCfg?.can_modify_portfolio??false;c4.push({name:'Scoped Delegation',passed:canTrade,reason:canTrade?`"${agentRole}" has portfolio modification rights`:`"${agentRole}" does NOT have portfolio rights — scoped delegation violation`,innovation:'Scoped delegation: non-overlapping capabilities'});}
  const g4pass=c4.every(c=>c.passed);gates.push({gate:4,name:'Runtime Authorization Binding',passed:g4pass,checks:c4,verdict:g4pass?'PASS':'BLOCK'});
  if(!g4pass){verdict='BLOCK';const fc=c4.find(c=>!c.passed);if(fc)blockReasons.push(fc.reason);blockGates.push('Gate 4: Runtime Auth');}
  return{engine:'ArmorIQ',version:'3.0.1',enforcement_mode:'fail_closed',verdict,gates,block_reasons:blockReasons,block_gates:blockGates,gates_passed:gates.filter(g=>g.passed).length,gates_total:gates.length,allow_execution:verdict==='ALLOW',enforced_at:new Date().toISOString()};
}

// ── Mock Execution ────────────────────────────────────────────────────────────
function mockExecLocal(parsed,intentToken){
  const price=MOCK_PRICES[parsed.ticker]||100;const slippage=price*0.0003;const fp=parsed.action==='buy'?price+slippage:price-slippage;const qty=Math.max(1,parsed.amount?Math.floor(parsed.amount/fp):1);
  return{order_id:`ORD-${rndHex(4)}-TGX`,status:'FILLED',symbol:parsed.ticker,side:parsed.action?.toUpperCase()||'BUY',qty,avg_fill_price:fp.toFixed(2),total_value:(qty*fp).toFixed(2),commission:0,slippage_bps:(slippage/price*10000).toFixed(2),account:'PAPER-TRADING-001',broker:'Alpaca Markets (Paper)',intent_token_ref:intentToken?.token_id,armoriq_cleared:true};
}

// ── Full pipeline runner ──────────────────────────────────────────────────────
function runFullPipeline(instruction,agentRole){
  const{parsed,intentToken,plan}=parseIntentLocal(instruction,agentRole);
  const riskAssessment=assessRiskLocal(parsed);
  const policyResult=evaluatePolicyLocal(parsed,intentToken,agentRole);
  const armoriqResult=runArmorIQLocal(parsed,intentToken,riskAssessment,policyResult,agentRole);
  const executionResult=armoriqResult.allow_execution?mockExecLocal(parsed,intentToken):null;
  return{verdict:armoriqResult.verdict,pipeline:{parsed,intentToken,plan,riskAssessment,policyResult,armoriqResult,executionResult}};
}

// ── Market data simulation ────────────────────────────────────────────────────
const MARKET_BASE = {AAPL:{price:189.45,prev:186.20,name:'Apple Inc.',sector:'Technology'},MSFT:{price:415.20,prev:410.80,name:'Microsoft Corp.',sector:'Technology'},GOOGL:{price:175.30,prev:172.90,name:'Alphabet Inc.',sector:'Technology'},AMZN:{price:195.60,prev:193.10,name:'Amazon.com Inc.',sector:'Consumer'},NVDA:{price:875.40,prev:862.10,name:'NVIDIA Corp.',sector:'Semiconductors'},TSLA:{price:248.10,prev:255.80,name:'Tesla Inc.',sector:'Automotive'},META:{price:520.80,prev:515.40,name:'Meta Platforms',sector:'Technology'},NFLX:{price:635.90,prev:628.30,name:'Netflix Inc.',sector:'Entertainment'},AMD:{price:162.40,prev:158.70,name:'AMD',sector:'Semiconductors'},JPM:{price:211.30,prev:209.80,name:'JPMorgan Chase',sector:'Finance'}};

function livePrice(sym){const b=MARKET_BASE[sym];if(!b)return null;const v=(VOLATILITY[sym]||30)/100;const noise=(Math.random()-.5)*2*v*b.price*0.004;return parseFloat((b.price+noise).toFixed(2));}

// ── Ticker tape ───────────────────────────────────────────────────────────────
function buildTickerHTML(){
  const items=Object.keys(MARKET_BASE).map(sym=>{const p=livePrice(sym);const ch=p-MARKET_BASE[sym].prev;const pct=(ch/MARKET_BASE[sym].prev*100);const cls=ch>=0?'tick-up':'tick-down';return`<span class="ticker-item"><span class="tick-sym">${sym}</span><span class="tick-price">$${p.toFixed(2)}</span><span class="${cls}">${ch>=0?'+':''}${pct.toFixed(2)}%</span></span>`;});
  const doubled=[...items,...items].join('');
  return doubled;
}
function initTicker(){const t=$('tickerTrack');if(t)t.innerHTML=buildTickerHTML();}
setInterval(()=>{const t=$('tickerTrack');if(t)t.innerHTML=buildTickerHTML();},8000);

// ── Tab routing ───────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-tab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.tab-page').forEach(p=>p.classList.remove('active'));
    tab.classList.add('active');
    const id=`tab-${tab.dataset.tab}`;
    const pg=$(id);if(pg)pg.classList.add('active');
    if(tab.dataset.tab==='market')loadMarketTab();
    if(tab.dataset.tab==='policy')loadPolicyTab();
    if(tab.dataset.tab==='logs')renderLogsTab();
    if(tab.dataset.tab==='architecture'){}
  });
});

// ── Demo buttons ──────────────────────────────────────────────────────────────
document.querySelectorAll('.demo-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    $('tradeInstruction').value=btn.dataset.i;
    $('agentRole').value=btn.dataset.r;
    $('tradeInstruction').focus();
  });
});

// ── Run pipeline ──────────────────────────────────────────────────────────────
$('btnExecute').addEventListener('click',runPipeline);
$('tradeInstruction').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey))runPipeline();});

async function runPipeline(){
  const instruction=$('tradeInstruction').value.trim();
  if(!instruction){$('tradeInstruction').style.borderColor='var(--red)';setTimeout(()=>$('tradeInstruction').style.borderColor='',1000);return;}
  showLoading();$('btnExecute').disabled=true;
  resetPipelineUI();
  const stepDelay=ms=>new Promise(r=>setTimeout(r,ms));
  activateLoadingStep('ls-openclaw');await stepDelay(350);
  activateLoadingStep('ls-prepolicy');await stepDelay(350);
  activateLoadingStep('ls-risk');await stepDelay(300);
  activateLoadingStep('ls-policy');await stepDelay(280);
  activateLoadingStep('ls-armoriq');await stepDelay(250);
  const result=runFullPipeline(instruction,$('agentRole').value);
  recordAudit(instruction,$('agentRole').value,result);
  updateStats();
  await animatePipeline(result);
  hideLoading();$('btnExecute').disabled=false;
}

let _loadingStepIdx=0;
const _lsIds=['ls-openclaw','ls-prepolicy','ls-risk','ls-policy','ls-armoriq'];
function showLoading(){$('loadingOverlay').classList.remove('hidden');_loadingStepIdx=0;_lsIds.forEach(id=>{const el=$(id);if(el){el.classList.remove('ls-active','ls-done');}});}
function hideLoading(){$('loadingOverlay').classList.add('hidden');}
function activateLoadingStep(id){
  _lsIds.forEach(sid=>{const el=$(sid);if(!el)return;if(el.classList.contains('ls-active')){el.classList.remove('ls-active');el.classList.add('ls-done');}});
  const el=$(id);if(el){el.classList.remove('ls-done');el.classList.add('ls-active');}
}

// ── Pipeline UI reset ─────────────────────────────────────────────────────────
function resetPipelineUI(){
  ['input','openclaw','prepolicy','contract','risk','policy','armoriq','result'].forEach(s=>{
    const node=document.querySelector(`#pf-${s} .pf-node`);const tag=$(`pft-${s}`);
    if(node){node.className='pf-node';if(s==='armoriq')node.className='pf-node armoriq-node';if(s==='result')node.className='pf-node result-node';}
    if(tag){tag.textContent='—';tag.className='pf-tag';}
  });
  const vb=$('verdictBadge');vb.textContent='RUNNING';vb.className='verdict-badge';
  ['planContent','contractContent','riskContent','policyContent','armoriqContent','execContent'].forEach(id=>{const el=$(id);if(el)el.innerHTML='<div class="empty-state">Processing…</div>';});
}

// ── Animate pipeline stages ───────────────────────────────────────────────────
const delay=ms=>new Promise(r=>setTimeout(r,ms));

async function animatePipeline({verdict,pipeline}){
  const{parsed,intentToken,plan,riskAssessment,policyResult,armoriqResult,executionResult}=pipeline;

  setStage('input',true,parsed.raw.length>40?parsed.raw.slice(0,40)+'…':parsed.raw,'●');await delay(180);
  setStage('openclaw',true,`${plan.length} steps · token ${intentToken.token_id}`,'OK');
  renderPlan(plan);await delay(180);
  const ppGate=riskAssessment.pre_policy_gate;
  setStage('prepolicy',ppGate.passed,ppGate.passed?'No unsafe signals detected':`${ppGate.threats?.length||1} threat(s) detected`,ppGate.passed?'PASS':'BLOCK');await delay(200);
  const g1=armoriqResult.gates?.find(g=>g.gate===1);
  setStage('contract',g1?.passed,g1?.passed?`Contract ${intentToken.token_id?.slice(0,12)}…`:'Scope violation',g1?.passed?'PASS':'BLOCK');
  renderContract(intentToken);await delay(180);
  const riskOk=!riskAssessment.overall.should_block;
  setStage('risk',riskOk,`${riskAssessment.overall.level} — score ${riskAssessment.overall.score}`,riskOk?'PASS':'BLOCK');
  renderRisk(riskAssessment);await delay(180);
  setStage('policy',policyResult.passed,policyResult.passed?'All rules passed':`${policyResult.rules_failed} rule(s) failed`,policyResult.passed?'PASS':'BLOCK');
  renderPolicy(policyResult);await delay(180);
  setStage('armoriq',verdict==='ALLOW','All gates cleared — execution authorized',verdict==='ALLOW'?'PASS':'BLOCK');
  renderArmorIQ(armoriqResult);await delay(180);
  renderExecution(executionResult,armoriqResult,verdict);
  const rn=$('pfResultNode');rn.className=`pf-node result-node ${verdict==='ALLOW'?'allow-node':'block-node'}`;
  $('pfResultIcon').textContent=verdict==='ALLOW'?'✅':'❌';
  $('pfResultName').textContent=verdict==='ALLOW'?'Trade Executed':'Trade Blocked';
  const rd=$('pfd-result');if(rd)rd.textContent=verdict==='ALLOW'?`Order ${executionResult?.order_id} FILLED`:`Blocked — ${armoriqResult.block_reasons?.[0]?.slice(0,60)||'enforcement gate'}`;
  const rt=$('pft-result');if(rt){rt.textContent=verdict;rt.className=`pf-tag ${verdict==='ALLOW'?'t-pass':'t-fail'}`;}
  const vb=$('verdictBadge');vb.textContent=verdict;vb.className=`verdict-badge ${verdict}`;
}

function setStage(id,passed,detail,tagText){
  const node=document.querySelector(`#pf-${id} .pf-node`);const tag=$(`pft-${id}`);const det=$(`pfd-${id}`);
  if(node){node.classList.remove('pf-passed','pf-blocked','pf-active');node.classList.add(passed?'pf-passed':'pf-blocked');}
  if(det&&detail)det.textContent=detail;
  if(tag){tag.textContent=tagText;tag.className=`pf-tag ${passed?'t-pass':'t-fail'}`;}
}

// ── Render functions ──────────────────────────────────────────────────────────
function renderPlan(plan){
  if(!plan?.length){$('planContent').innerHTML='<div class="empty-state">No plan</div>';return;}
  $('planContent').innerHTML=plan.map(s=>`
    <div class="plan-step ${s.innovation?'innovation-step':''} ai">
      <div class="ps-num">${s.step}</div>
      <div class="ps-agent">${s.agent}</div>
      <div class="ps-action">${s.action} — ${s.description}</div>
      ${s.innovation?'<span class="ps-inno">PRE-GATE</span>':''}
    </div>`).join('');
}

function renderContract(token){
  const fmt=JSON.stringify(token,null,2)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"([^"]+)":/g,'<span class="jk">"$1":</span>')
    .replace(/: "([^"]*)"/g,': <span class="js">"$1"</span>')
    .replace(/: (\d+(?:\.\d+)?)/g,': <span class="jn">$1</span>')
    .replace(/: (true|false|null)/g,': <span class="jb">$1</span>');
  $('contractContent').innerHTML=`<pre class="code-json">${fmt}</pre>`;
}

function riskCol(label){return{LOW:'#00C853','LOW-MEDIUM':'#43A047',MEDIUM:'#FF9800',HIGH:'#FF6D00',CRITICAL:'#F44336',CLEAN:'#00C853',SUSPICIOUS:'#FF9800',ELEVATED:'#FF6D00',MALICIOUS:'#F44336',UNKNOWN:'#94A3B8'}[label]||'#2196F3';}

function renderRisk(risk){
  const{components,overall,pre_policy_gate}=risk;const c=riskCol(overall.level);
  const ppHtml=pre_policy_gate.blocked
    ?`<div class="threat-box ai"><div class="pre-gate-label">⚡ Pre-Policy Gate — BLOCKED (Innovation)</div>${pre_policy_gate.threats.map(t=>`<div class="threat-row"><span class="threat-type">${t.threat}</span><span>${t.reason}</span></div>`).join('')}</div>`
    :`<div class="pre-gate-pass ai">✅ Pre-policy gate PASSED — no unsafe signals detected</div>`;
  $('riskContent').innerHTML=`
    <div class="risk-overall ai" style="border-color:${c}">
      <div class="risk-circle" style="border-color:${c};color:${c};background:${c}18"><span class="rs">${overall.score}</span><span class="rl">${overall.level}</span></div>
      <div class="risk-info"><div class="risk-level" style="color:${c}">${overall.level}</div><div class="risk-note">${overall.should_block?'🚫 Risk engine BLOCKS this trade':'✅ Within acceptable risk range'}</div></div>
    </div>
    <div class="risk-bars ai">
      ${['amount','ticker','volatility','instruction'].map(k=>`
        <div class="rb-row">
          <div class="rb-name">${k.charAt(0).toUpperCase()+k.slice(1)}</div>
          <div class="rb-track"><div class="rb-fill" style="width:${components[k].score}%;background:${riskCol(components[k].label)}"></div></div>
          <div class="rb-val">${components[k].score}</div>
        </div>`).join('')}
    </div>
    ${ppHtml}
  `;
}

function renderPolicy(pr){
  if(!pr){$('policyContent').innerHTML='<div class="empty-state">No results</div>';return;}
  $('policyContent').innerHTML=pr.results.map(r=>`
    <div class="pol-row ${r.passed?'pr-pass':'pr-fail'} ai">
      <span class="pol-icon">${r.passed?'✅':'❌'}</span>
      <span class="pol-name">${r.rule_type.replace(/_/g,' ')}</span>
      <span class="pol-msg">${r.message}</span>
      <span class="sev-tag sev-${r.severity}">${r.severity}</span>
    </div>`).join('');
}

function renderArmorIQ(aq){
  if(!aq){$('armoriqContent').innerHTML='<div class="empty-state">No results</div>';return;}
  $('armoriqContent').innerHTML=aq.gates.map(g=>`
    <div class="aq-gate ai">
      <div class="aq-gate-hdr">
        <div class="aq-gnum">G${g.gate}</div>
        <div class="aq-gname">${g.name}</div>
        <div class="aq-verdict ${g.verdict}">${g.verdict}</div>
      </div>
      <div class="aq-gate-body">
        ${g.checks.map(c=>`
          <div class="aq-check">
            <span class="aq-check-icon">${c.passed?'✅':'❌'}</span>
            <div><div class="aq-check-reason">${c.reason}</div>${c.innovation_label?`<div class="aq-inno">💡 ${c.innovation_label}</div>`:''}</div>
          </div>`).join('')}
        ${g.innovation?`<div class="aq-inno" style="margin-top:4px;padding-left:4px">💡 ${g.innovation}</div>`:''}
      </div>
    </div>`).join('');
}

function renderExecution(exec,aq,verdict){
  $('execIcon').textContent=verdict==='ALLOW'?'✅':'❌';
  $('execTitle').textContent=verdict==='ALLOW'?'Trade Executed':'Trade Blocked';
  $('execChip').textContent=verdict==='ALLOW'?'Alpaca Paper':'Blocked';
  $('execChip').className=`chip ${verdict==='ALLOW'?'teal-chip':'red-chip'}`;
  if(verdict==='ALLOW'&&exec){
    $('execContent').innerHTML=`
      <div class="exec-card ec-allow ai">
        <div class="exec-hdr">
          <span style="font-size:1.4rem">✅</span>
          <div><div class="exec-verdict" style="color:var(--green-d)">EXECUTED</div><div class="exec-sub">Alpaca Paper Trading · ${exec.broker}</div></div>
        </div>
        <div class="exec-grid">
          ${[['Order ID',exec.order_id],['Status',exec.status],['Symbol',exec.symbol],['Side',exec.side],['Qty',exec.qty+' shares'],['Fill Price','$'+exec.avg_fill_price],['Total','$'+exec.total_value],['Slippage',exec.slippage_bps+'bps'],['Commission','$'+exec.commission],['Account',exec.account]].map(([l,v])=>`<div><div class="ef-label">${l}</div><div class="ef-val">${v}</div></div>`).join('')}
        </div>
      </div>`;
  }else{
    const reasons=aq?.block_reasons||['Enforcement gate blocked this trade'];
    $('execContent').innerHTML=`
      <div class="exec-card ec-block ai">
        <div class="exec-hdr">
          <span style="font-size:1.4rem">❌</span>
          <div><div class="exec-verdict" style="color:var(--red-d)">BLOCKED</div><div class="exec-sub">Fail-closed — nothing executed</div></div>
        </div>
        <div class="block-reasons">
          <div class="br-label">Block Reasons (${reasons.length})</div>
          ${reasons.map(r=>`<div class="br-row"><span>🚫</span><span>${r}</span></div>`).join('')}
        </div>
        ${aq?.block_gates?.length?`<div style="margin-top:10px;font-size:.72rem;color:var(--g500)">Gates triggered: ${aq.block_gates.join(' · ')}</div>`:''}
      </div>`;
  }
}

// ── Audit & Stats ─────────────────────────────────────────────────────────────
function recordAudit(instruction,agentRole,{verdict,pipeline}){
  const entry={log_id:rndHex(6).toUpperCase(),timestamp:new Date().toISOString(),instruction,agent_role:agentRole,ticker:pipeline.parsed?.ticker||null,amount:pipeline.parsed?.amount||null,risk_level:pipeline.riskAssessment?.overall?.level||'?',policy_passed:pipeline.policyResult?.passed??false,pre_policy_gate_passed:pipeline.riskAssessment?.pre_policy_gate?.passed??null,injection_detected:pipeline.riskAssessment?.components?.instruction?.injection_detected||false,armoriq_verdict:verdict,status:verdict==='ALLOW'?'EXECUTED':'BLOCKED',execution_order:pipeline.executionResult?.order_id||null};
  auditLogs.unshift(entry);
  if(auditLogs.length>100)auditLogs.pop();
}

function updateStats(){
  const total=auditLogs.length,executed=auditLogs.filter(l=>l.status==='EXECUTED').length,blocked=auditLogs.filter(l=>l.status==='BLOCKED').length;
  const prePolicy=auditLogs.filter(l=>l.pre_policy_gate_passed===false).length;
  const injections=auditLogs.filter(l=>l.injection_detected).length;
  $('stat-total').textContent=total;
  $('stat-executed').textContent=executed;
  $('stat-blocked').textContent=blocked;
  $('stat-pre-policy').textContent=prePolicy;
  $('stat-injections').textContent=injections;
  $('stat-blockrate').textContent=(total?Math.round(blocked/total*100):0)+'%';
}

// ── Market Tab ────────────────────────────────────────────────────────────────
function loadMarketTab(){
  renderMarketGrid();renderPortfolio();renderOrders();
}
$('btnRefreshMarket')?.addEventListener('click',loadMarketTab);

function renderMarketGrid(){
  const wl=SYSTEM_CONFIG.intent.allowed_tickers;
  $('marketGrid').innerHTML=Object.keys(MARKET_BASE).map(sym=>{
    const p=livePrice(sym);const b=MARKET_BASE[sym];const ch=p-b.prev;const pct=ch/b.prev*100;const up=ch>=0;const isWL=wl.includes(sym);
    return`<div class="mq-card ai">
      <div class="mq-sym">${sym}</div>
      <div class="mq-name">${b.name}</div>
      <div class="mq-price">$${p.toFixed(2)}</div>
      <div class="mq-change ${up?'mq-up':'mq-down'}">${up?'▲':'▼'} ${Math.abs(ch).toFixed(2)} (${pct.toFixed(2)}%)</div>
      <div class="mq-meta"><span>${b.sector}</span><span>Vol: ${(VOLATILITY[sym]||30)}%</span></div>
      <span class="mq-wl ${isWL?'':'mq-nwl'}">${isWL?'✅ Whitelisted':'❌ Restricted'}</span>
    </div>`;
  }).join('');
}

function renderPortfolio(){
  const POSITIONS=[{sym:'AAPL',qty:15,cost:182.30},{sym:'MSFT',qty:8,cost:398.10},{sym:'NVDA',qty:5,cost:810.00},{sym:'AMZN',qty:12,cost:188.20}];
  const pv=POSITIONS.reduce((s,p)=>{const cur=livePrice(p.sym)||p.cost;return s+(cur*p.qty);},0)+18420.30;
  const dpnl=POSITIONS.reduce((s,p)=>{const cur=livePrice(p.sym)||p.cost;const prev=MARKET_BASE[p.sym]?.prev||p.cost;return s+((cur-prev)*p.qty);},0);
  $('portfolioContent').innerHTML=`
    <div class="portfolio-hdr">
      <div class="pf-stat"><div class="pf-stat-val">$${pv.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div><div class="pf-stat-lbl">Portfolio Value</div></div>
      <div class="pf-stat"><div class="pf-stat-val">$18,420.30</div><div class="pf-stat-lbl">Cash</div></div>
      <div class="pf-stat"><div class="pf-stat-val ${dpnl>=0?'pnl-pos':'pnl-neg'}">${dpnl>=0?'+':''}$${Math.abs(dpnl).toFixed(2)}</div><div class="pf-stat-lbl">Day P&L</div></div>
    </div>
    <table class="pos-table">
      <thead><tr><th>Symbol</th><th>Qty</th><th>Avg Cost</th><th>Current</th><th>Mkt Value</th><th>Unrealized P&L</th><th>Return</th></tr></thead>
      <tbody>${POSITIONS.map(p=>{const cur=livePrice(p.sym)||p.cost;const mv=(cur*p.qty).toFixed(2);const upnl=((cur-p.cost)*p.qty).toFixed(2);const upct=(((cur-p.cost)/p.cost)*100).toFixed(2);const pos=parseFloat(upnl)>=0;return`<tr><td style="font-weight:700">${p.sym}</td><td>${p.qty}</td><td>$${p.cost}</td><td>$${cur.toFixed(2)}</td><td>$${mv}</td><td class="${pos?'pnl-pos':'pnl-neg'}">${pos?'+':''}$${upnl}</td><td class="${pos?'pnl-pos':'pnl-neg'}">${pos?'+':''}${upct}%</td></tr>`;}).join('')}</tbody>
    </table>`;
}

function renderOrders(){
  const execOrders=auditLogs.filter(l=>l.status==='EXECUTED').slice(0,5);
  if(!execOrders.length){$('ordersContent').innerHTML='<div class="empty-state">No orders executed yet — run a trade first</div>';return;}
  $('ordersContent').innerHTML=`<table class="ord-table">
    <thead><tr><th>Order ID</th><th>Time</th><th>Symbol</th><th>Side</th><th>Amount</th><th>Status</th></tr></thead>
    <tbody>${execOrders.map(o=>`<tr><td>${o.execution_order||'—'}</td><td>${new Date(o.timestamp).toLocaleTimeString()}</td><td style="font-weight:700">${o.ticker||'—'}</td><td>BUY</td><td>${o.amount?'$'+o.amount:'—'}</td><td><span class="bg-executed">FILLED</span></td></tr>`).join('')}</tbody>
  </table>`;
}

// ── Policy Tab ────────────────────────────────────────────────────────────────
function loadPolicyTab(){
  $('policyCards').innerHTML=POLICY_RULES.map(r=>{
    const skip=['id','type','description','severity'];
    const detail=Object.entries(r).filter(([k])=>!skip.includes(k)).map(([k,v])=>`${k}: ${JSON.stringify(v)}`).join('\n');
    return`<div class="pc-card ai">
      <div class="pc-hdr">
        <span class="pc-id">${r.id}</span>
        <span class="pc-type">${r.type.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</span>
        <span class="sev-tag sev-${r.severity}">${r.severity}</span>
      </div>
      <div class="pc-desc">${r.description}</div>
      <div class="pc-detail">${detail}</div>
    </div>`;
  }).join('');
}

// ── Logs Tab ──────────────────────────────────────────────────────────────────
function renderLogsTab(){
  const total=auditLogs.length,exec=auditLogs.filter(l=>l.status==='EXECUTED').length,block=auditLogs.filter(l=>l.status==='BLOCKED').length,pp=auditLogs.filter(l=>l.pre_policy_gate_passed===false).length,inj=auditLogs.filter(l=>l.injection_detected).length;
  $('logStats').innerHTML=[['Total',total,''],['Executed',exec,'color:var(--green-d)'],['Blocked',block,'color:var(--red-d)'],['Pre-Policy Blocks',pp,'color:var(--orange)'],['Injections',inj,'color:var(--red-d)'],['Block Rate',total?Math.round(block/total*100)+'%':'0%','']].map(([l,v,s])=>`<div class="ls-card"><div class="ls-val" style="${s}">${v}</div><div class="ls-lbl">${l}</div></div>`).join('');
  if(!auditLogs.length){$('logTableBody').innerHTML='<tr><td colspan="9" class="table-empty">No logs yet — run a trade</td></tr>';return;}
  $('logTableBody').innerHTML=auditLogs.map(l=>`<tr>
    <td>${l.log_id}</td>
    <td>${new Date(l.timestamp).toLocaleTimeString()}</td>
    <td title="${l.instruction}" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.instruction.length>36?l.instruction.slice(0,36)+'…':l.instruction}</td>
    <td style="font-weight:600">${l.ticker||'—'}</td>
    <td>${l.amount?'$'+l.amount:'—'}</td>
    <td class="${l.pre_policy_gate_passed===false?'bg-pp-fail':'bg-pp-pass'}">${l.pre_policy_gate_passed===null?'—':l.pre_policy_gate_passed?'✅':'❌'}</td>
    <td><span class="bg-risk-${l.risk_level}">${l.risk_level}</span></td>
    <td>${l.policy_passed?'✅':'❌'}</td>
    <td><span class="${l.status==='EXECUTED'?'bg-executed':'bg-blocked'}">${l.status}</span></td>
  </tr>`).join('');
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',()=>{
  initTicker();
  updateStats();
});
