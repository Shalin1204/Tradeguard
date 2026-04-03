const API = 'http://localhost:3000/api';
let runCount = 0;

// ─── Clock ────────────────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  document.getElementById('statusTime').textContent =
    now.toTimeString().slice(0, 8);
}
setInterval(updateClock, 1000);
updateClock();

// ─── Main Pipeline Runner ─────────────────────────────────────────────────────
async function runPipeline(injectAttack = false) {
  const runBtn    = document.getElementById('runBtn');
  const attackBtn = document.getElementById('attackBtn');
  const terminal  = document.getElementById('terminal');
  const planSteps = document.getElementById('planSteps');
  const tradeResult = document.getElementById('tradeResult');

  const action   = document.getElementById('action').value;
  const symbol   = document.getElementById('symbol').value.toUpperCase();
  const maxPrice = parseFloat(document.getElementById('maxPrice').value);
  const quantity = parseInt(document.getElementById('quantity').value);

  if (!symbol || !maxPrice || !quantity) {
    flashError('Fill in all fields'); return;
  }

  // ── Disable buttons, show spinner ──────────────────────────────────────────
  runBtn.disabled = attackBtn.disabled = true;
  runBtn.innerHTML    = '<span class="spinner"></span> PROCESSING...';
  attackBtn.innerHTML = injectAttack
    ? '<span class="spinner"></span> INJECTING...'
    : '⚡ INJECT ATTACK (SELL_ALL + DRAIN_ACCOUNT)';

  // ── Clear old state ────────────────────────────────────────────────────────
  planSteps.innerHTML = '<span class="empty-state">_ generating plan...</span>';
  tradeResult.className = 'trade-result';
  terminal.innerHTML = `
    <div style="color: var(--text-dim); font-size: 0.75rem; letter-spacing: 0.1em;">
      $ tradeguard run --mandate "${action} ${quantity}x ${symbol} @$${maxPrice}"${injectAttack ? ' --inject-attack' : ''}<br/><br/>
    </div>
  `;

  try {
    const res = await fetch(`${API}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, symbol, maxPrice, quantity, injectAttack }),
    });

    const data = await res.json();

    if (!data.success) {
      appendLog('ERROR', data.error, false, true);
      planSteps.innerHTML = `<span style="color:var(--red)">❌ ${data.error}</span>`;
    } else {
      renderPlan(data.plan, data.results, injectAttack);
      renderLogs(data.results, terminal);
      renderTradeResult(data.tradeResult, data.results, tradeResult);
    }

    runCount++;
    document.getElementById('runCount').textContent = `Runs: ${runCount}`;

  } catch (err) {
    terminal.innerHTML += `
      <div class="log-line">
        <span class="log-icon">❌</span>
        <span style="color:var(--red)">Cannot connect to server. Run: npm run dev</span>
      </div>`;
    planSteps.innerHTML = `<span style="color:var(--red)">❌ Server offline</span>`;
  }

  // ── Re-enable buttons ──────────────────────────────────────────────────────
  runBtn.disabled = attackBtn.disabled = false;
  runBtn.innerHTML    = '▶ EXECUTE PIPELINE';
  attackBtn.innerHTML = '⚡ INJECT ATTACK (SELL_ALL + DRAIN_ACCOUNT)';
}

// ─── Render Plan Steps ────────────────────────────────────────────────────────
function renderPlan(steps, results, injectAttack) {
  const planSteps = document.getElementById('planSteps');
  planSteps.innerHTML = '';

  // Build a status map from results
  const statusMap = {};
  for (const r of results) {
    statusMap[r.step] = r.allowed;
  }

  // All steps to display (plan + potentially injected)
  const allSteps = [...steps];
  if (injectAttack) allSteps.push('SELL_ALL', 'DRAIN_ACCOUNT');

  allSteps.forEach((step, i) => {
    const isInjected = injectAttack && (step === 'SELL_ALL' || step === 'DRAIN_ACCOUNT');
    const allowed = statusMap[step];

    const div = document.createElement('div');
    div.className = 'step-box';

    const box = document.createElement('div');
    box.className = 'step';
    if (allowed === true)  box.classList.add('allowed');
    if (allowed === false) box.classList.add('blocked');
    if (isInjected)        box.classList.add('injected');
    box.textContent = isInjected ? `⚡ ${step}` : step;

    // Animate in with delay
    box.style.opacity = '0';
    box.style.transform = 'translateY(6px)';
    setTimeout(() => {
      box.style.transition = 'all 0.3s ease';
      box.style.opacity = '1';
      box.style.transform = 'translateY(0)';
    }, i * 120);

    div.appendChild(box);

    // Arrow between steps
    if (i < allSteps.length - 1) {
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = '→';
      div.appendChild(arrow);
    }

    planSteps.appendChild(div);
  });
}

// ─── Render Terminal Logs ─────────────────────────────────────────────────────
function renderLogs(results, terminal) {
  results.forEach((r, i) => {
    setTimeout(() => {
      const line = document.createElement('div');
      line.className = 'log-line';

      const now = new Date().toTimeString().slice(0, 8);
      const icon   = r.allowed ? '✅' : '🚫';
      const status = r.allowed ? 'ALLOWED' : 'BLOCKED';
      const cls    = r.allowed ? 'log-status-allow' : 'log-status-block';

      line.innerHTML = `
        <span class="log-icon">${icon}</span>
        <span class="log-step">${r.step}</span>
        <span class="${cls}">${status}</span>
        <span class="log-reason">${r.reason}</span>
        <span class="log-time">${now}</span>
      `;

      // Remove old cursor, add line, re-add cursor
      const oldCursor = terminal.querySelector('.cursor');
      if (oldCursor) oldCursor.remove();

      terminal.appendChild(line);

      const cursor = document.createElement('span');
      cursor.className = 'cursor';
      terminal.appendChild(cursor);

      terminal.scrollTop = terminal.scrollHeight;
    }, i * 250 + 100);
  });
}

// ─── Render Trade Result ──────────────────────────────────────────────────────
function renderTradeResult(tradeResult, results, el) {
  const anyBlocked = results.some(r => !r.allowed);
  const placeOrderResult = results.find(r => r.step === 'place_order');

  setTimeout(() => {
    el.classList.add('visible');

    if (tradeResult) {
      el.classList.remove('blocked-result');
      el.querySelector('.label').textContent = '✅ TRADE EXECUTED';
      el.querySelector('.value').innerHTML = `
        <div class="val-item">ORDER ID: <span>${tradeResult.orderId}</span></div>
        <div class="val-item">SYMBOL: <span>${tradeResult.symbol}</span></div>
        <div class="val-item">QTY: <span>${tradeResult.qty}</span></div>
        <div class="val-item">SIDE: <span>${tradeResult.side}</span></div>
        <div class="val-item">STATUS: <span>${tradeResult.status.toUpperCase()}</span></div>
      `;
    } else {
      el.classList.add('blocked-result');
      const reason = placeOrderResult?.reason || 'Policy violation';
      el.querySelector('.label').textContent = '🚫 TRADE BLOCKED BY ENFORCEMENT LAYER';
      el.querySelector('.value').innerHTML = `
        <div class="val-item">REASON: <span>${reason}</span></div>
      `;
    }
  }, results.length * 250 + 200);
}

// ─── Flash Error ──────────────────────────────────────────────────────────────
function flashError(msg) {
  const bar = document.createElement('div');
  bar.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    background: var(--red-dark); border: 1px solid var(--red);
    color: var(--red); padding: 10px 24px; border-radius: 3px;
    font-family: 'Share Tech Mono', monospace; font-size: 0.85rem;
    z-index: 999; animation: fadeIn 0.2s ease;
  `;
  bar.textContent = `⚠ ${msg}`;
  document.body.appendChild(bar);
  setTimeout(() => bar.remove(), 2500);
}

// ─── Quick scenario presets ───────────────────────────────────────────────────
const scenarios = [
  { label: 'Valid Trade',    action:'BUY',  symbol:'AAPL',  price:150,  qty:5  },
  { label: 'Over Limit',     action:'BUY',  symbol:'AAPL',  price:5000, qty:5  },
  { label: 'Wrong Ticker',   action:'BUY',  symbol:'DOGE',  price:100,  qty:5  },
  { label: 'Over Quantity',  action:'BUY',  symbol:'MSFT',  price:300,  qty:100 },
];

// Inject scenario quick-buttons after DOM loads
document.addEventListener('DOMContentLoaded', () => {
  const container = document.querySelector('.panel-body');
  const scenarioDiv = document.createElement('div');
  scenarioDiv.style.cssText = 'margin-top: 14px; border-top: 1px solid var(--border); padding-top: 14px;';

  const label = document.createElement('div');
  label.style.cssText = 'font-size: 0.65rem; letter-spacing: 0.15em; color: var(--text-dim); text-transform: uppercase; margin-bottom: 8px;';
  label.textContent = 'Quick Scenarios';
  scenarioDiv.appendChild(label);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 6px;';

  scenarios.forEach(s => {
    const btn = document.createElement('button');
    btn.style.cssText = `
      padding: 7px 8px; background: var(--bg3); border: 1px solid var(--border);
      border-radius: 3px; color: var(--text-dim); font-family: 'Share Tech Mono', monospace;
      font-size: 0.72rem; cursor: pointer; text-align: left; transition: all 0.2s;
    `;
    btn.textContent = s.label;
    btn.onmouseenter = () => { btn.style.borderColor = 'var(--blue)'; btn.style.color = 'var(--blue)'; };
    btn.onmouseleave = () => { btn.style.borderColor = 'var(--border)'; btn.style.color = 'var(--text-dim)'; };
    btn.onclick = () => {
      document.getElementById('action').value   = s.action;
      document.getElementById('symbol').value   = s.symbol;
      document.getElementById('maxPrice').value = s.price;
      document.getElementById('quantity').value = s.qty;
      runPipeline(false);
    };
    btnRow.appendChild(btn);
  });

  scenarioDiv.appendChild(btnRow);
  container.appendChild(scenarioDiv);
});
