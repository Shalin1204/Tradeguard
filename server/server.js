// TradeGuard X — Server v2.0
'use strict';

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'client')));

// Request logger
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    const start = Date.now();
    res.on('finish', () => {
      const ms    = Date.now() - start;
      const color = res.statusCode < 400 ? '\x1b[32m' : '\x1b[31m';
      console.log(`${color}${req.method}\x1b[0m ${req.path} → ${res.statusCode} (${ms}ms)`);
    });
  }
  next();
});

// ── API routes ────────────────────────────────────────────────
app.use('/api', require('./routes/api'));

// ── Frontend SPA ──────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

// ── Error handler ─────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[TradeGuard X] Unhandled error:', err.message);
  // Fail-closed: any unhandled error blocks execution
  res.status(500).json({ error: 'Internal error', verdict: 'BLOCK', fail_closed: true });
});

app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║     TradeGuard X — v2.0  OPERATIONAL         ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Server   → http://localhost:${PORT}             ║`);
  console.log('║  ArmorIQ  → ACTIVE  (fail-closed)            ║');
  console.log('║  OpenClaw → ACTIVE  (intent contracts)       ║');
  console.log('║  Risk Eng → ACTIVE  (pre-policy gating)      ║');
  console.log('║  Policy   → LOADED  (9 rules)                ║');
  console.log('╚══════════════════════════════════════════════╝\n');
});

module.exports = app;
