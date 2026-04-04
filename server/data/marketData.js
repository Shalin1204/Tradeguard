// TradeGuard X — Mock Market Data Engine
// Simulates realistic Alpaca-style market data with live-ish tick simulation

const BASE_PRICES = {
  AAPL:  { price: 189.45, prev_close: 186.20, name: 'Apple Inc.',          sector: 'Technology',   market_cap: 2.94e12 },
  MSFT:  { price: 415.20, prev_close: 410.80, name: 'Microsoft Corp.',     sector: 'Technology',   market_cap: 3.08e12 },
  GOOGL: { price: 175.30, prev_close: 172.90, name: 'Alphabet Inc.',       sector: 'Technology',   market_cap: 2.17e12 },
  AMZN:  { price: 195.60, prev_close: 193.10, name: 'Amazon.com Inc.',     sector: 'Consumer',     market_cap: 2.06e12 },
  NVDA:  { price: 875.40, prev_close: 862.10, name: 'NVIDIA Corp.',        sector: 'Semiconductors',market_cap: 2.15e12 },
  TSLA:  { price: 248.10, prev_close: 255.80, name: 'Tesla Inc.',          sector: 'Automotive',   market_cap: 0.79e12 },
  META:  { price: 520.80, prev_close: 515.40, name: 'Meta Platforms',      sector: 'Technology',   market_cap: 1.32e12 },
  NFLX:  { price: 635.90, prev_close: 628.30, name: 'Netflix Inc.',        sector: 'Entertainment',market_cap: 0.28e12 },
  AMD:   { price: 162.40, prev_close: 158.70, name: 'Advanced Micro Devices',sector:'Semiconductors',market_cap: 0.26e12 },
  JPM:   { price: 211.30, prev_close: 209.80, name: 'JPMorgan Chase',      sector: 'Finance',      market_cap: 0.61e12 },
};

const VOLATILITY = {
  AAPL:18, MSFT:15, GOOGL:22, AMZN:28, NVDA:45,
  TSLA:72, META:38, NFLX:42, AMD:52, JPM:20
};

// Simulated portfolio positions
const PORTFOLIO = {
  account_id: 'TGX-PAPER-001',
  account_type: 'PAPER',
  buying_power: 50000.00,
  portfolio_value: 124380.50,
  cash: 18420.30,
  positions: [
    { symbol: 'AAPL', qty: 15, avg_cost: 182.30, current_price: 189.45, market_value: 2841.75, unrealized_pnl: 107.25, pnl_pct: 3.92 },
    { symbol: 'MSFT', qty: 8,  avg_cost: 398.10, current_price: 415.20, market_value: 3321.60, unrealized_pnl: 136.80, pnl_pct: 4.29 },
    { symbol: 'NVDA', qty: 5,  avg_cost: 810.00, current_price: 875.40, market_value: 4377.00, unrealized_pnl: 327.00, pnl_pct: 8.07 },
    { symbol: 'AMZN', qty: 12, avg_cost: 188.20, current_price: 195.60, market_value: 2347.20, unrealized_pnl: 88.80, pnl_pct: 3.93 },
  ],
  daily_pnl: +642.85,
  daily_pnl_pct: 0.52,
};

// Order book simulation
const ORDER_HISTORY = [];
let orderSeq = 1000;

function getTickPrice(symbol) {
  const base = BASE_PRICES[symbol];
  if (!base) return null;
  const vol = (VOLATILITY[symbol] || 30) / 100;
  const noise = (Math.random() - 0.5) * 2 * vol * base.price * 0.005;
  return parseFloat((base.price + noise).toFixed(2));
}

function getQuote(symbol) {
  const base = BASE_PRICES[symbol];
  if (!base) return null;
  const price = getTickPrice(symbol);
  const spread = price * 0.0002;
  const change = price - base.prev_close;
  const changePct = (change / base.prev_close) * 100;
  return {
    symbol,
    name: base.name,
    sector: base.sector,
    bid: parseFloat((price - spread).toFixed(2)),
    ask: parseFloat((price + spread).toFixed(2)),
    last: price,
    prev_close: base.prev_close,
    change: parseFloat(change.toFixed(2)),
    change_pct: parseFloat(changePct.toFixed(2)),
    volume: Math.floor(Math.random() * 5000000 + 1000000),
    avg_volume: 4200000,
    volatility_30d: VOLATILITY[symbol] || 30,
    market_cap: base.market_cap,
    timestamp: new Date().toISOString(),
  };
}

function getAllQuotes() {
  return Object.keys(BASE_PRICES).map(sym => getQuote(sym));
}

function getPortfolio() {
  // Update current prices with tick simulation
  const updated = { ...PORTFOLIO };
  updated.positions = PORTFOLIO.positions.map(p => {
    const current = getTickPrice(p.symbol) || p.current_price;
    const mv = parseFloat((current * p.qty).toFixed(2));
    const upnl = parseFloat(((current - p.avg_cost) * p.qty).toFixed(2));
    const upnl_pct = parseFloat((((current - p.avg_cost) / p.avg_cost) * 100).toFixed(2));
    return { ...p, current_price: current, market_value: mv, unrealized_pnl: upnl, pnl_pct: upnl_pct };
  });
  updated.portfolio_value = parseFloat(
    (updated.cash + updated.positions.reduce((s, p) => s + p.market_value, 0)).toFixed(2)
  );
  return updated;
}

function placeOrder(symbol, side, qty, price, intentTokenId) {
  const orderId = `ORD-${(++orderSeq).toString(36).toUpperCase()}-TGX`;
  const fillPrice = getTickPrice(symbol) || price;
  const totalValue = parseFloat((qty * fillPrice).toFixed(2));
  const order = {
    order_id: orderId,
    client_order_id: `TGX-${Date.now()}`,
    symbol,
    side: side.toUpperCase(),
    type: 'MARKET',
    qty,
    filled_qty: qty,
    avg_fill_price: fillPrice,
    total_value: totalValue,
    status: 'FILLED',
    time_in_force: 'DAY',
    submitted_at: new Date().toISOString(),
    filled_at: new Date(Date.now() + 850 + Math.random() * 300).toISOString(),
    broker: 'Alpaca Markets (Paper)',
    account: PORTFOLIO.account_id,
    intent_token_ref: intentTokenId,
    commission: 0.00,
    asset_class: 'us_equity',
    extended_hours: false,
  };
  ORDER_HISTORY.unshift(order);
  if (ORDER_HISTORY.length > 50) ORDER_HISTORY.pop();
  return order;
}

function getOrderHistory(limit = 10) {
  return ORDER_HISTORY.slice(0, limit);
}

function getTodayTradeCount() {
  const today = new Date().toDateString();
  return ORDER_HISTORY.filter(o => new Date(o.submitted_at).toDateString() === today).length;
}

module.exports = { getQuote, getAllQuotes, getPortfolio, placeOrder, getOrderHistory, getTodayTradeCount, BASE_PRICES, VOLATILITY };
