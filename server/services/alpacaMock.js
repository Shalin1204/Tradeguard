// Alpaca Execution Layer — TradeGuard X
// Only reached when ALL ArmorIQ gates pass.
// Simulates realistic paper trading execution with slippage, fill times, etc.

const { placeOrder, getQuote } = require('../data/marketData');

function mockExecuteTrade(parsed, intentToken) {
  const symbol = parsed.ticker;
  const side   = parsed.action || 'buy';
  const quote  = getQuote(symbol);

  // Realistic price calculation with market impact
  const price = quote ? quote.last : 100.00;
  const slippage = price * (Math.random() * 0.0008 + 0.0001); // 0.01%-0.08%
  const fillPrice = side === 'buy'
    ? parseFloat((price + slippage).toFixed(2))
    : parseFloat((price - slippage).toFixed(2));

  const qty = parsed.amount
    ? Math.max(1, Math.floor(parsed.amount / fillPrice))
    : (parsed.qty || 1);
  const totalValue = parseFloat((qty * fillPrice).toFixed(2));
  const commission = 0.00; // Alpaca is commission-free

  const order = placeOrder(symbol, side, qty, fillPrice, intentToken?.token_id);

  return {
    ...order,
    qty,
    avg_fill_price: fillPrice,
    total_value: totalValue,
    commission,
    slippage: parseFloat(slippage.toFixed(4)),
    slippage_bps: parseFloat((slippage / price * 10000).toFixed(2)),
    market_price_at_order: price,
    quote_snapshot: quote ? {
      bid: quote.bid,
      ask: quote.ask,
      change_pct: quote.change_pct,
      volatility_30d: quote.volatility_30d,
    } : null,
    execution_latency_ms: Math.round(850 + Math.random() * 350),
    routing: 'IEX → NASDAQ → NYSE (simulated)',
    guardrails_passed: 4,
    intent_contract_ref: intentToken?.token_id,
    armoriq_cleared: true,
  };
}

module.exports = { mockExecuteTrade };
