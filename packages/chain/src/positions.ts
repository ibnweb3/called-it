// A player's positions, from their point of view: what did I call, did it land,
// what can I claim. Derived entirely from on-chain outcome-token balances — a
// redeem burns the tokens, so a positive balance in a settled round is exactly
// an unclaimed win (or an unclaimed void refund).

import type { CalledItClient } from "./client.js";
import { currentRounds } from "./rounds.js";
import { fromRawUnits } from "./quantize.js";
import { settledRounds } from "./settlement.js";
import type { Address, Position, Round, RoundStatus } from "./types.js";

/**
 * Open + recently settled positions for `address`. `settledScan` bounds how far
 * back the settled sweep looks (default 25 rounds).
 */
export async function positions(
  client: CalledItClient,
  address: Address,
  settledScan = 25,
): Promise<Position[]> {
  const { exchange } = client;

  const live = await currentRounds(client);
  const done = await settledRounds(client, { limit: settledScan });

  const seen = new Set(live.map((r) => r.marketId.toLowerCase()));
  const doneIds = done.filter((d) => !seen.has(d.marketId.toLowerCase()));

  const out: Position[] = [];

  for (const r of live) {
    const p = await positionInRound(client, address, r.marketId, r.asset, r.intervalSec, r.status, r.locksAt);
    if (p) out.push(p);
  }

  for (const d of doneIds) {
    const onchain = await exchange.client.getMarketOnchain(d.marketId).catch(() => null);
    if (!onchain) continue;
    const status: RoundStatus = onchain.isVoided ? "voided" : "resolved";
    const p = await positionInRound(client, address, d.marketId, d.asset, d.intervalSec, status, d.locksAt, onchain);
    if (p) out.push(p);
  }

  return out.sort((a, b) => b.locksAt - a.locksAt);
}

async function positionInRound(
  client: CalledItClient,
  address: Address,
  marketId: Round["marketId"],
  asset: Position["asset"],
  intervalSec: number,
  status: RoundStatus,
  locksAt: number,
  onchainIn?: Awaited<ReturnType<CalledItClient["exchange"]["client"]["getMarketOnchain"]>>,
): Promise<Position | null> {
  const { exchange } = client;
  const onchain = onchainIn ?? (await exchange.client.getMarketOnchain(marketId).catch(() => null));
  if (!onchain) return null;

  const [yes, no] = await Promise.all([
    exchange.client.getOutcomeBalance({ outcomeToken: onchain.outcomeToken, account: address, id: onchain.yesId }),
    exchange.client.getOutcomeBalance({ outcomeToken: onchain.outcomeToken, account: address, id: onchain.noId }),
  ]);
  if (yes === 0n && no === 0n) return null;

  const dp = onchain.decimals;
  const yesH = fromRawUnits(yes, dp);
  const noH = fromRawUnits(no, dp);
  // Called It only ever buys one side; take the larger holding as the call.
  const side = yesH >= noH ? "UP" : "DOWN";
  const contracts = Math.max(yesH, noH);

  let outcome: Position["outcome"] = "pending";
  let claimable = 0;
  if (onchain.isVoided) {
    outcome = "void";
    claimable = contracts * 0.5;
  } else if (onchain.isResolved) {
    const won = (onchain.winningOutcome === 0 ? "UP" : "DOWN") === side;
    outcome = won ? "won" : "lost";
    claimable = won ? contracts : 0;
  }

  return {
    marketId,
    asset,
    intervalSec,
    side,
    contracts: round4(contracts),
    status,
    outcome,
    claimable: round4(claimable),
    locksAt,
  };
}

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
