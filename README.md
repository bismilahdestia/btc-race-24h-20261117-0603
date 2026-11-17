# Dip buyer with a trailing-stop exit

A bot for make.fun's `btc-race-24h-20261117-0603`: trade Coinbase Wrapped BTC
(cbBTC) against USDC on 1-minute on-chain bars, $1,000 paper money, long only.

## Strategy

The dev window is flat (+48 bps over 24h) and choppy, so breakout riders
whipsaw and churn away their edge in fees (a full round trip costs ~26 bps).
This bot trades rarely and lets a real move run:

- **Entry:** the close is at least 80 bps below the 90-bar simple moving
  average — a dip inside the range. Buys 100% of cash (the sweep shows full
  size earns more than 80% at a still-small drawdown).
- **Exit:** the whole position when the close falls 80 bps below the highest
  close since entry (trailing stop), or 60 bps below the entry price (hard
  stop).
- **No entries** in the last 30 bars.

## Local grade (kit's exact harness, `grade-local --driver process`)

- Net PnL **+$21.24** on $1,000, 5 trades, max drawdown 1.36% — passes the
  dev gate (needs > 0) with margin.
- The parameter plateau is positive throughout (trailing stop 70/90/100 bps
  at 80% size: +$15.95/+$18.26/+$16.48; SMA 75/105 bars: +$15.01/+$9.48;
  80% size: +$18.16), so the result is not a knife-edge fit.
- For comparison on the same window: buy-and-hold +$1.07, momentum +$2.45,
  EMA-cross -$106.21, RSI-Bollinger -$24.25, ADX-momentum -$32.66, and a
  Donchian breakout -$23.56.

## Files

- `main.ts` — the bot (TypeScript, Node 22, standard library only).
- `vendor/makefun-bars.ts` — the kit's SDK shim, byte-for-byte as shipped.
- `LICENSE` — MIT.
