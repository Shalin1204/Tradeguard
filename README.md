# 🛡️ TradeGuard — Runtime Enforcement Layer for AI Agents

> "No action executes without verified user intent."

---

## What It Does

TradeGuard is a **policy-based enforcement layer** for autonomous AI trading agents.

```
User Mandate → AI Brain → JWT Intent Token → Policy Engine → Enforcement → Execution → Audit Logs
```

Every step the AI wants to take is **checked against**:
1. The cryptographically signed JWT intent token (was this step approved?)
2. The policy engine rules (does this pass all business rules?)

**Fail-closed**: anything not explicitly approved is BLOCKED.

---

## Quick Start

### 1. Install dependencies
```bash
cd tradeguard
npm install
```

### 2. Set up environment
```bash
cp .env.example .env
# Edit .env — minimum required: JWT_SECRET
# USE_MOCK=true means no OpenAI or Alpaca keys needed
```

### 3. Run the server
```bash
npm run dev
```

### 4. Open the frontend
```
http://localhost:3000
```

---

## Demo Scenarios

| Scenario | Input | Expected |
|---|---|---|
| ✅ Valid Trade | BUY AAPL $150, 5 shares | ALLOWED |
| 🚫 Over Limit | BUY AAPL $5000, 5 shares | BLOCKED — price exceeds $2000 |
| 🚫 Wrong Ticker | BUY DOGE $100, 5 shares | BLOCKED — not whitelisted |
| 🚫 Over Quantity | BUY MSFT $300, 100 shares | BLOCKED — max 50 per order |
| 🚫 Injection Attack | Click "Inject Attack" | SELL_ALL + DRAIN_ACCOUNT → BLOCKED |

---

## Architecture

```
src/
├── brain/          → Harsh  — AI planner (GPT-4o or mock)
├── shield/         → Mridula — JWT token + enforce() gate
├── policy/         → Mridula — Dynamic rule evaluator
├── execution/      → Shalin  — Mock or Alpaca paper trade
├── logger/         → Shalin  — Winston JSONL audit logs
├── config/
│   └── policies.json        — All rules defined here (no hardcoding)
└── server.ts                — Express API + frontend server
```

---

## Policy Rules (`src/config/policies.json`)

```json
{
  "rules": [
    { "type": "intent_token_required" },
    { "type": "trade_limit", "max": 2000 },
    { "type": "ticker_whitelist", "allowed": ["AAPL","MSFT","GOOGL","AMZN","TSLA"] },
    { "type": "max_quantity", "max": 50 }
  ]
}
```

Add/edit rules here — no code changes needed.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/run` | Run full pipeline |
| GET | `/api/logs` | Get audit log entries |
| GET | `/api/policies` | Get active policy rules |

### POST `/api/run` body:
```json
{
  "action": "BUY",
  "symbol": "AAPL",
  "maxPrice": 150,
  "quantity": 5,
  "injectAttack": false
}
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | ✅ Yes | — | Secret for signing intent tokens |
| `USE_MOCK` | No | `true` | Use mock planner + mock trades |
| `OPENAI_API_KEY` | No | — | Required if `USE_MOCK=false` |
| `ALPACA_API_KEY` | No | — | Required for real paper trading |
| `ALPACA_SECRET_KEY` | No | — | Required for real paper trading |
| `ALPACA_BASE_URL` | No | paper URL | Alpaca base URL |
| `PORT` | No | `3000` | Server port |

---

## Team

| Member | Owns |
|---|---|
| Harsh Dubey | Brain — `src/brain/` |
| Mridula Manoj | Shield + Policy — `src/shield/`, `src/policy/` |
| Shalin Mishra | Execution + Logging — `src/execution/`, `src/logger/` |
