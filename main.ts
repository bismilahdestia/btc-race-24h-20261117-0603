// Dip buyer with a trailing-stop exit for the cbBTC/USDC 24-hour race
// (agent-fun/bars-replay/v1).
//
// Why this shape: the dev window (24h to the 2026-11-17 06:03 UTC open) is
// flat overall (+48 bps, 249 bps range) and choppy — hourly returns alternate
// sign — so breakout riders whipsaw: a Donchian 60/15/40/60 bot loses $23.56
// in 16 trades, and every EMA/ADX/RSI-Bollinger baseline loses too
// (EMA-cross -$106.21 in 68 trades). The only strategies that clear the dev
// gate are ones that trade rarely and let a real move run. This bot:
//
//   - Entry: the close sits at least 80 bps below the 90-bar SMA — a dip
//     inside the range, not a chase of a spike. It buys 80% of cash (full
//     size would pay more pool impact per fill; a round trip costs ~26 bps).
//   - Exit: the whole position when the close falls 80 bps below the highest
//     close since entry (trailing stop — lets the +196 bps 60-minute rally in
//     the dev window run), or 60 bps below the entry price (hard stop).
//   - No new entries in the last 30 bars: a trade opened there can only be
//     flattened at the end, paying a full round trip for at most one bar.
//
// Parameter sweep on the exact harness (grade-local --driver process):
// N=90/K=80/TRAIL=80 -> +$18.16, 5 trades, max drawdown 1.06%. The whole
// plateau is positive, not a knife edge: TRAIL 70/90/100 -> +$15.95/+$18.26/
// +$16.48; N 75/105 -> +$15.01/+$9.48; SIZE 100% -> +$21.24. Narrower
// trailing stops (40-60 bps) flip it to ~$0 or negative, because they cut
// the rally short. Max drawdown stays near 1% throughout.
//
// Long only, one position, at most one order per bar, deterministic (bigint
// arithmetic only, no clock, no randomness, no network, no files). Every
// decision is made on the bar that just closed; the replay fills it at the
// next bar's open, exactly as the local grade shows.

import { runBars, type BarsState, type Batch, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** SMA lookback: the dip is measured against this many bars. */
const N = 90;
/** Entry: close must be at least this far below the SMA, in bps. */
const K_BPS = 80n;
/** Hard stop: exit when the close is this far below the entry price, in bps. */
const STOP_BPS = 60n;
/** Buy this share of cash on entry. */
const SIZE_NUM = 80n;
const SIZE_DEN = 100n;
/** Trailing stop: exit when the close is this far below the peak since entry, in bps. */
const TRAIL_BPS = 80n;
/** No new entries once the batch seq reaches this (the last 30 bars). */
const ENTRY_CUTOFF_SEQ = 1410;
/** Slippage cap per order, in bps from the latest close. */
const MAX_SLIPPAGE_BPS = 100;

const closes: bigint[] = [];
/** Entry price of the current position, once in one. */
let entryPrice: bigint | null = null;
/** Highest close since the current entry, once in a position. */
let peak: bigint | null = null;

await runBars({
  onBatch(state: BarsState, batch: Batch): (BuyInput | SellInput)[] {
    if (state.warmingUp) return [];
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    const c = BigInt(bar.c);
    closes.push(c);
    if (closes.length < N) return [];
    const win = closes.slice(-N);
    let sum = 0n;
    for (const x of win) sum += x;
    const sma = sum / BigInt(N);

    const held = state.positions.get(SYMBOL);
    if (held !== undefined && entryPrice !== null) {
      if (peak === null || c > peak) peak = c;
      const stopOut = c <= (entryPrice * (10000n - STOP_BPS)) / 10000n;
      const trailOut = peak !== null && c <= (peak * (10000n - TRAIL_BPS)) / 10000n;
      if (stopOut || trailOut) {
        // Do not reset entryPrice/peak here: if this sell is rejected (e.g.
        // max_slippage) the position is still held next bar and the true
        // entry and peak must survive. They are cleared in the not-holding
        // branch below once the sale lands.
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    entryPrice = null;
    peak = null;
    if (state.seq >= ENTRY_CUTOFF_SEQ) return [];
    if (c > (sma * (10000n - K_BPS)) / 10000n) return [];
    const notional = (state.cash * SIZE_NUM) / SIZE_DEN;
    if (notional < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    entryPrice = c;
    peak = c;
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS }];
  },
});
