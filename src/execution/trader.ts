import { TradeResult } from "../types/types";

// ─── Mock Trader ─────────────────────────────────────────────────────────────
function mockTrade(symbol: string, qty: number, side: string): TradeResult {
  const orderId = `MOCK-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  console.log(`📦 [Execution] MOCK trade: ${side.toUpperCase()} ${qty}x ${symbol}`);
  return {
    orderId,
    symbol,
    qty,
    side,
    status: "filled",
    timestamp: new Date().toISOString(),
  };
}

// ─── Alpaca Paper Trade ───────────────────────────────────────────────────────
async function alpacaTrade(
  symbol: string,
  qty: number,
  side: string
): Promise<TradeResult> {
  const axios = (await import("axios")).default;

  const headers = {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY!,
    "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY!,
    "Content-Type": "application/json",
  };

  const res = await axios.post(
    `${process.env.ALPACA_BASE_URL}/v2/orders`,
    {
      symbol,
      qty: String(qty),
      side: side.toLowerCase(),
      type: "market",
      time_in_force: "gtc",
    },
    { headers }
  );

  return {
    orderId: res.data.id,
    symbol,
    qty,
    side,
    status: res.data.status,
    timestamp: res.data.created_at,
  };
}

// ─── Main Export ─────────────────────────────────────────────────────────────
export async function executeTrade(
  symbol: string,
  qty: number,
  side: string
): Promise<TradeResult> {
  const useMock = process.env.USE_MOCK !== "false" || !process.env.ALPACA_API_KEY;

  if (useMock) {
    return mockTrade(symbol, qty, side);
  }
  return alpacaTrade(symbol, qty, side);
}
