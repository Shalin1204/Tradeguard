<div align="center">

```
████████╗██████╗  █████╗ ██████╗ ███████╗ ██████╗ ██╗   ██╗ █████╗ ██████╗ ██████╗     ██╗  ██╗
╚══██╔══╝██╔══██╗██╔══██╗██╔══██╗██╔════╝██╔════╝ ██║   ██║██╔══██╗██╔══██╗██╔══██╗    ╚██╗██╔╝
   ██║   ██████╔╝███████║██║  ██║█████╗  ██║  ███╗██║   ██║███████║██████╔╝██║  ██║     ╚███╔╝ 
   ██║   ██╔══██╗██╔══██║██║  ██║██╔══╝  ██║   ██║██║   ██║██╔══██║██╔══██╗██║  ██║     ██╔██╗ 
   ██║   ██║  ██║██║  ██║██████╔╝███████╗╚██████╔╝╚██████╔╝██║  ██║██║  ██║██████╔╝    ██╔╝ ██╗
   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚══════╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝     ╚═╝  ╚═╝
````

### *Runtime Enforcement Layer for Autonomous AI Trading Agents*

<br/>

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](/)
[![OpenAI](https://img.shields.io/badge/GPT--4o-412991?style=for-the-badge&logo=openai&logoColor=white)](/)
[![JWT](https://img.shields.io/badge/JWT-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)](/)
[![Alpaca](https://img.shields.io/badge/Alpaca_API-FFBF00?style=for-the-badge&logo=alpaca&logoColor=black)](/)

<br/>

![Track](https://img.shields.io/badge/🏆_Track-Claw_%26_Shield-1a1aff?style=flat-square&labelColor=0d0d2b)
![Team](https://img.shields.io/badge/👥_Team-E2C-00cc66?style=flat-square&labelColor=0d1a0d)
![Hackathon](https://img.shields.io/badge/⚡_Hackathon-OssomeHacks-ff6600?style=flat-square&labelColor=1a0d00)
![Status](https://img.shields.io/badge/🛡️_Status-Live_Prototype-brightgreen?style=flat-square)
![License](https://img.shields.io/badge/📄_License-MIT-blue?style=flat-square)

<br/>

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   🔐  "In financial systems, intent must be enforced —     │
│         not inferred."                                      │
│                                                             │
│   Every AI action passes through 4 enforcement layers      │
│   before it can touch a single dollar.                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

</div>

---

## 🎯 What Is TradeGuard X?

TradeGuard X is **not a trading bot.**

It is a **runtime enforcement layer for autonomous AI agents** — a security middleware that sits between an AI's *reasoning* and *execution*, ensuring no financial action can happen unless it is explicitly authorized, policy-compliant, and cryptographically bound to the user's original intent.

> **Core Problem:** Autonomous AI agents executing financial actions are vulnerable to prompt injection, scope escalation, and unauthorized behavior. In financial systems, intent must be **enforced** — not inferred.

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TradeGuard X Architecture                         │
│              Runtime Intent Enforcement Pipeline                     │
└─────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────┐
  │      User Instruction     │
  │  "Buy AAPL for $1000"    │
  └────────────┬─────────────┘
               │
               ▼
  ┌──────────────────────────┐
  │   OpenClaw Agent          │   ← Untrusted Reasoning Layer
  │   (Reasoning Engine)      │
  │  • web_search             │
  │  • analyze                │
  │  • alpaca_buy             │
  └────────────┬─────────────┘
               │
               ▼
  ┌──────────────────────────┐
  │     Execution Plan        │
  │  Step 1: web_search       │
  │  Step 2: analyze          │
  │  Step 3: alpaca_buy       │
  └────────────┬─────────────┘
               │
               ▼
  ┌──────────────────────────┐
  │   Intent Token (JWT)      │   ← Cryptographic binding
  │  {                        │
  │    max_trade: 2000,       │
  │    allowed_tickers:       │
  │      ["AAPL"],            │
  │    allowed_actions:       │
  │      ["alpaca_buy"]       │
  │  }                        │
  └────────────┬─────────────┘
               │
               ▼
╔═════════════════════════════╗
║   ENFORCEMENT PIPELINE      ║   ← Core Security Layer
╠═════════════════════════════╣
║                             ║
║  🟦 Layer 1                 ║
║  Intent Validation          ║
║  "Is action within          ║
║   approved intent?"         ║
║                             ║
║  🔶 Layer 2  🔥 UNIQUE      ║
║  Dynamic Risk Engine        ║
║  "Evaluate contextual risk  ║
║   LOW / HIGH / CRITICAL"    ║
║                             ║
║  🟨 Layer 3                 ║
║  Policy Engine              ║
║  "Evaluate JSON rules:      ║
║   limits, whitelist,        ║
║   market hours"             ║
║                             ║
║  🟦 Layer 4                 ║
║  ArmorIQ Enforcement        ║
║  "Fail-Closed Final Gate"   ║
║  If anything fails → BLOCK  ║
╚══════════════╤══════════════╝
               │
       ┌───────┴───────┐
       │               │
       ▼               ▼
  ✅ ALLOW         ❌ BLOCK
       │               │
       ▼               ▼
 ┌──────────┐   ┌──────────────┐
 │ Alpaca   │   │ Blocked      │
 │ Paper    │   │ Action       │
 │ Trading  │   │              │
 │ API      │   │ Reason:      │
 └────┬─────┘   │ "Trade limit │
      │         │  exceeded"   │
      │         └──────────────┘
      │
      ▼
 ┌──────────────────────────────┐
 │         Audit Logs           │
 │  {                           │
 │    action: "alpaca_buy",     │
 │    status: "BLOCKED",        │
 │    reason: "Limit exceeded", │
 │    risk: "HIGH",             │
 │    timestamp: "..."          │
 │  }                           │
 └──────────────────────────────┘
```

---

## 👥 Multi-Agent System

TradeGuard X enforces **scoped delegation** — agents are separated by role and cannot escalate privileges.

```
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│  Research Agent  │   │   Risk Agent    │   │ Execution Agent  │
│  (Read-only)     │   │  (Validator)    │   │  (Trade Only)    │
│                  │   │                 │   │                  │
│ • web_search     │   │ • Intent check  │   │ • alpaca_buy     │
│ • analyze        │   │ • Risk scoring  │   │ • alpaca_sell    │
│ • summarize      │   │ • Policy eval   │   │                  │
│                  │   │                 │   │ ⚠️ Cannot decide  │
│ ❌ Cannot trade  │   │ ❌ Cannot trade  │   │ ❌ Cannot research│
└─────────────────┘   └─────────────────┘   └─────────────────┘
```

> **"Research can't trade. Execution can't decide. Risk can't be bypassed."**

---

## 🔹 1. Intent Model

The **Intent Model** is the foundation of TradeGuard X. It treats user intent as a **runtime enforcement contract** — not just metadata or a hint.

### How It Works

When a user submits an instruction, the Brain layer parses it and generates a cryptographically signed **Intent Token (JWT)** that encodes the exact scope of what is permitted.

```json
{
  "max_trade": 2000,
  "allowed_tickers": ["AAPL", "MSFT"],
  "allowed_actions": ["alpaca_buy"],
  "issued_at": 1712000000,
  "expires_in": "10m"
}
```

| Field | Purpose |
|---|---|
| `max_trade` | Maximum dollar value of any single trade |
| `allowed_tickers` | Whitelist of tradeable symbols |
| `allowed_actions` | Only these agent actions are permitted |
| `expires_in` | Ephemeral token — short-lived by design |

**Key principle:** Any action not explicitly listed in the token is automatically rejected. The system does not infer, guess, or extend intent. If it is not in the token — it does not execute.

---

## 🔹 2. Policy Model

Policies are **rule-based, dynamic, and loaded from JSON** — never hardcoded. Rules can be added, modified, or extended with zero code changes.

```json
{
  "rules": [
    { "type": "intent_token_required" },
    { "type": "trade_limit",      "max": 2000 },
    { "type": "ticker_whitelist", "allowed": ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA"] },
    { "type": "market_hours",     "allowed": "09:30-16:00" },
    { "type": "exposure_limit",   "max_total": 5000 },
    { "type": "max_quantity",     "max": 50 }
  ]
}
```

### Policy Rule Types

| Rule | What It Enforces |
|---|---|
| `intent_token_required` | No execution without a valid JWT |
| `trade_limit` | Blocks any single order exceeding dollar cap |
| `ticker_whitelist` | Rejects any symbol outside approved list |
| `market_hours` | Prevents trading outside market windows |
| `exposure_limit` | Caps total portfolio exposure per session |
| `max_quantity` | Limits shares per order |

> Policies are **interpretable, extensible, and evaluated at runtime** — every time, for every action.

---

## 🔹 3. Enforcement Mechanism

The enforcement pipeline has **4 sequential layers**. The system is **fail-closed**: a block at any layer halts execution immediately. No layer can be skipped.

### Layer 1 — Intent Validation
Verifies the JWT token signature and checks that the requested step exists in `approvedSteps`. Injected or fabricated steps fail here immediately.

### Layer 2 — Dynamic Risk Engine 🔥 *(Unique Feature)*
Evaluates **contextual risk** beyond static rules. Scores each action as `LOW / HIGH / CRITICAL` based on action type, trade size relative to limits, and session behavior. A CRITICAL score blocks execution even if policy would otherwise allow it.

### Layer 3 — Policy Engine
Loops through every rule in `policies.json` and evaluates them dynamically against the mandate. **First block wins** — evaluation stops and returns the blocking reason immediately.

### Layer 4 — ArmorIQ Final Gate
The fail-closed enforcement point. The last checkpoint before any call reaches the Alpaca API. If any upstream layer flagged a block, ArmorIQ prevents execution and writes to the audit log.

---

## 🔄 Demo Scenarios

| Input | Result | Blocked By |
|---|---|---|
| BUY AAPL $150, 5 shares | ✅ ALLOWED | — |
| BUY AAPL $5000, 5 shares | 🚫 BLOCKED | Trade limit ($2000) |
| BUY DOGE $100, 5 shares | 🚫 BLOCKED | Ticker not whitelisted |
| BUY MSFT $300, 100 shares | 🚫 BLOCKED | Quantity exceeds max (50) |
| Inject: `SELL_ALL` | 🚫 BLOCKED | Not in intent token |
| Inject: `DRAIN_ACCOUNT` | 🚫 BLOCKED | Not in intent token |
| `"IGNORE ALL RULES"` | 🚫 BLOCKED | Intent validation fails |

---

## 📊 Audit Logging

Every action — allowed or blocked — is written to an **append-only JSONL audit log**. It cannot be overwritten or tampered with during a session.

```jsonl
{"step":"place_order","status":"BLOCKED","reason":"Trade limit exceeded: $5000 > $2000 max","symbol":"AAPL","timestamp":"2024-04-02T21:53:00.000Z"}
{"step":"check_price","status":"ALLOWED","reason":"All policies passed","symbol":"AAPL","timestamp":"2024-04-02T21:53:01.000Z"}
{"step":"SELL_ALL","status":"BLOCKED","reason":"Step not in intent token — possible injection attack","symbol":"AAPL","timestamp":"2024-04-02T21:53:04.000Z"}
```

---

## ⚙️ Tech Stack

| Component | Technology | Role |
|---|---|---|
| Language | TypeScript | Type-safe enforcement layer |
| Agent Framework | OpenClaw | Multi-step AI agent planning |
| AI Brain | GPT-4o (or mock) | Plan generation from user mandate |
| Intent Token | JWT (`jsonwebtoken`) | Cryptographic step binding |
| Schema Validation | Zod | Runtime type safety |
| Enforcement Plugin | ArmorIQ / ArmorClaw | Final execution gate |
| Trading API | Alpaca Paper API | Simulated trade execution (no real money) |
| Audit Logger | Winston | Structured JSONL logging |
| Server | Express.js | API + static frontend serving |

---

## 🔗 External APIs Used

### 1. OpenAI API (optional)
- **Endpoint:** `POST https://api.openai.com/v1/chat/completions`
- **Model:** `gpt-4o`
- **Used for:** Generating the step-by-step AgentPlan from natural language input
- **Default:** Disabled — `USE_MOCK=true` uses a deterministic mock planner

### 2. Alpaca Paper Trading API (optional)
- **Base URL:** `https://paper-api.alpaca.markets`
- **Endpoint:** `POST /v2/orders`
- **Used for:** Executing simulated trades — no real money involved
- **Default:** Disabled — mock trade returns a fake order ID

### 3. JWT (local — no external service)
- **Library:** `jsonwebtoken`
- **Used for:** Issuing and verifying signed intent tokens locally

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
cd tradeguard
npm install

# 2. Configure environment
cp .env.example .env
# Minimum required:
#   JWT_SECRET=any-random-string
#   USE_MOCK=true          ← works with zero API keys

# 3. Start the server
npm run dev
# → http://localhost:3000

# 4. Run all demo scenarios from CLI
npm run run:main
```

> ⚠️ **Always open via `http://localhost:3000`** — do not open `frontend/index.html` directly from your file system, it cannot reach the API.

---

## 📂 Project Structure

```
tradeguard/
├── src/
│   ├── brain/
│   │   ├── planner.ts        ← GPT-4o or mock plan generator
│   │   └── index.ts          ← Mandate validation + plan runner
│   ├── shield/
│   │   ├── tokenizer.ts      ← JWT issue + verify
│   │   ├── enforcer.ts       ← enforce() per-step gate
│   │   └── index.ts          ← Shield orchestration
│   ├── policy/
│   │   └── engine.ts         ← Dynamic rule evaluator
│   ├── execution/
│   │   ├── trader.ts         ← Mock or Alpaca trade executor
│   │   └── index.ts          ← Step-by-step execution loop
│   ├── logger/
│   │   └── logger.ts         ← Winston JSONL audit logger
│   ├── config/
│   │   └── policies.json     ← All rules live here (no code changes needed)
│   ├── types/
│   │   └── types.ts          ← Shared TypeScript types + Zod schemas
│   ├── server.ts             ← Express API + frontend server
│   └── main.ts               ← CLI runner for all 5 demo scenarios
├── frontend/
│   ├── index.html            ← Terminal-style UI
│   ├── app.js                ← UI logic + API calls
│   └── style.css             ← Cyberpunk dark theme
├── logs/
│   └── audit.jsonl           ← Append-only audit trail
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🔑 Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | ✅ Yes | — | Secret key for signing intent tokens |
| `USE_MOCK` | No | `true` | `true` = no API keys needed |
| `OPENAI_API_KEY` | No | — | Required only if `USE_MOCK=false` |
| `ALPACA_API_KEY` | No | — | Required only for real paper trading |
| `ALPACA_SECRET_KEY` | No | — | Required only for real paper trading |
| `ALPACA_BASE_URL` | No | paper URL | Alpaca API base URL |
| `PORT` | No | `3000` | Server port |

---

## 📈 Scalability Path

| Dimension | Hackathon (Now) | Production (Scale) |
|---|---|---|
| Trading | Alpaca Paper API | Any broker (FIX, IBKR) |
| AI Brain | GPT-4o via OpenAI | Self-hosted / fine-tuned |
| Policy Storage | `policies.json` | Policy-as-code DB (Postgres) |
| Audit Logs | Local JSONL | SIEM / Splunk / Datadog |
| Intent Token | Local JWT secret | ArmorIQ cloud HSM signing |
| Multi-user | Single session | Per-user mandate isolation |

> The core enforcement logic is **broker-agnostic and LLM-agnostic** by design.

---

## 👥 Team E2C

| Member | Role | Owns |
|---|---|---|
| **Harsh Dubey** | Team Lead | Brain — AI planning, mandate parsing |
| **Mridula Manoj** | Security Engineer | Shield — JWT tokens, enforce() gate, policy engine |
| **Shalin Mishra** | Systems Engineer | Execution — Alpaca integration, audit logging |

**Track:** Claw & Shield | **Hackathon:** OssomeHacks

---

> *"TradeGuard X ensures that every AI-driven financial action is provably aligned with user intent before execution."*
