// One entry point. Builds a `SomniaMarkets` exchange from a `ChainConfig` plus
// an optional signer, and hands back the exchange, its config, and a `venueId`
// scope. Everything else in this package takes a `CalledItClient`.
//
// Node (backend, croupier) and the browser (burner-wallet bets) both call this.
// The only browser caveat: pass the burner key as `privateKey`; the SDK signs
// locally with viem and broadcasts over the config's WS RPC.

import { SomniaMarkets } from "@somnia-chain/markets-sdk";
import { defineChain, type Account, type Chain, type WalletClient } from "viem";
import type { ChainConfig } from "./config.js";

export interface CalledItClient {
  exchange: SomniaMarkets;
  config: ChainConfig;
  /** True when a signer is loaded — required for placeCall / claim / mintSet. */
  canTrade: boolean;
  /** The signer address, or undefined for a read-only client. */
  address?: `0x${string}`;
}

export interface ClientOptions {
  /** A funded key — the SDK signs locally (backend, croupier). */
  privateKey?: `0x${string}`;
  /** A local viem account. Alternative to `privateKey`. */
  account?: Account | `0x${string}`;
  /**
   * A browser wallet (viem `WalletClient` over an injected EIP-1193 provider) —
   * the SDK routes writes through `writeContract` and the player confirms each
   * one. This is how the web app trades. Omit all three for a read-only client.
   */
  walletClient?: WalletClient;
}

function makeChain(cfg: ChainConfig): Chain {
  return defineChain({
    id: cfg.chainId,
    name: `somnia-${cfg.chainId}`,
    nativeCurrency:
      cfg.chainId === 5031
        ? { name: "Somnia", symbol: "SOMI", decimals: 18 }
        : { name: "Somnia Test Token", symbol: "STT", decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpcUrl], webSocket: [cfg.wsRpcUrl] } },
  });
}

export function createClient(config: ChainConfig, opts: ClientOptions = {}): CalledItClient {
  const exchange = new SomniaMarkets({
    indexerUrl: config.indexerUrl,
    chain: makeChain(config),
    wsRpcUrl: config.wsRpcUrl,
    addresses: config.addresses,
    priceFeed: config.priceFeedUrl ? { url: config.priceFeedUrl, quote: "USDC" } : undefined,
    privateKey: opts.privateKey,
    account: opts.account,
    walletClient: opts.walletClient,
  });

  return {
    exchange,
    config,
    canTrade: Boolean(opts.privateKey || opts.account || opts.walletClient),
    address: exchange.walletAddress as `0x${string}` | undefined,
  };
}

/**
 * Close the exchange without letting a one-shot script hang. The live-tail
 * socket can keep the event loop alive past `close()`, so this caps the wait.
 */
export async function closeClient(client: CalledItClient, timeoutMs = 3_000): Promise<void> {
  await Promise.race([
    Promise.resolve(client.exchange.close()).catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/**
 * Throw if a trader write's receipt says the transaction REVERTED. The SDK
 * signs with fixed fees and skips simulation, so a reverting tx is not caught
 * before send, and the write helpers resolve with `{ hash, receipt }` WITHOUT
 * checking `receipt.status`. Wrap every state-changing call whose failure matters.
 */
export function assertTxOk(
  res: { hash?: string; receipt?: { status?: string }; info?: { receipt?: { status?: string } } },
  label = "transaction",
): void {
  const status = res?.receipt?.status ?? res?.info?.receipt?.status;
  if (status === "reverted") {
    throw new Error(
      `${label} REVERTED on-chain (tx ${res.hash ?? "?"}). The SDK does not throw on a reverted ` +
        `receipt — check market status / balances and retry deliberately.`,
    );
  }
}
