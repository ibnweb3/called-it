// The write path — the only place the app touches a chain directly.
//
// Writes are signed in the player's connected wallet: `@called-it/chain` hands
// the injected `WalletClient` to the markets SDK, which routes each call through
// `writeContract`, so the player confirms every order (and, once, an ERC-20
// approve for the stake token). This module is imported dynamically, so a
// bundling problem lands as a message on the "Call it" button and everything
// else — rounds, streaks, rooms — keeps working. If it cannot run here, build
// with CHAIN_IN_BROWSER=0 and take Fallback A (Web Worker) or B (backend
// broadcasts a signed intent).

import { createClient, resolveConfig, placeCall, claim, claimAll } from "@called-it/chain";
import type { WalletClient } from "viem";
import { NETWORK } from "./env";
import { PlayerFacingError } from "./gateway";
import type { ChainBridge } from "./live";
import type { CallReceipt, Round, Side } from "./types";

export function load(walletClient: WalletClient): ChainBridge {
  const client = createClient(resolveConfig(NETWORK), { walletClient });

  return {
    async placeCall(round: Round, side: Side, chipUsd: number): Promise<CallReceipt> {
      try {
        const receipt = await placeCall(client, {
          round: { marketId: round.marketId as `0x${string}`, symbol: round.symbol },
          side,
          chipUsd,
        });
        return receipt as unknown as CallReceipt;
      } catch (err) {
        throw translate(err);
      }
    },

    async claim(marketId: string): Promise<number> {
      try {
        return await claim(client, marketId as `0x${string}`);
      } catch (err) {
        throw translate(err);
      }
    },

    async claimAll(): Promise<{ rounds: number; usd: number }> {
      try {
        return await claimAll(client);
      } catch (err) {
        throw translate(err);
      }
    },
  };
}

/** Chain errors are for logs. Players get a sentence and a way forward. */
function translate(err: unknown): PlayerFacingError {
  const raw = err instanceof Error ? err.message : String(err);
  const text = raw.toLowerCase();

  if (text.includes("insufficient") && text.includes("funds")) {
    return new PlayerFacingError("Not enough gas", "Top up STT and try again.");
  }
  if (text.includes("balance") || text.includes("allowance") || text.includes("transfer amount")) {
    return new PlayerFacingError("Not enough in the play wallet", "Top up and try again.");
  }
  if (text.includes("not trading") || text.includes("locked") || text.includes("window")) {
    return new PlayerFacingError("That window just closed", "Here is the next one.");
  }
  if (text.includes("user rejected") || text.includes("user denied") || text.includes("4001")) {
    return new PlayerFacingError("Call cancelled");
  }
  if (text.includes("chain") && (text.includes("mismatch") || text.includes("does not match"))) {
    return new PlayerFacingError("Wrong network", `Switch your wallet to ${NETWORK === "mainnet" ? "Somnia" : "Somnia Shannon"}.`);
  }
  console.error("[chain]", err);
  return new PlayerFacingError("The chain didn't take that one", raw.slice(0, 140));
}
