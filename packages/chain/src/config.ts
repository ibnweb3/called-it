// Network config for Called It. Pure data — no node builtins, no dotenv, no fs —
// so this module loads unchanged in the browser (burner-wallet bets) and in Node
// (backend, croupier).
//
// Addresses are copied from @dreamdex-bot-kit/ec-core (addresses.ts, verified
// 2026-07-24) and the endpoint table from its config.ts. The protocol core is
// CREATE3-deterministic, so it is identical on both networks; only `collateral`
// and `marketCreator` differ.
//
// VENUE IDs MOVE. Both networks changed theirs three times in the first week of
// August 2026. The values here are a starting point — if the client reports "no
// rounds" or "markets span several venues", read the live venueId off a market
// row and pass it in via `ChainConfig.venueId`.

export type Network = "testnet" | "mainnet";

export type Address = `0x${string}`;

export interface ChainConfig {
  network: Network;
  chainId: number;
  rpcUrl: string;
  wsRpcUrl: string;
  indexerUrl: string;
  /** Collateral decimals: 6 on testnet (tUSDC), 18 on mainnet (USDso). */
  decimals: number;
  /** Book granularity in raw units. Not discoverable through the SDK for binary
   *  markets (their rows carry no tickSize/lotSize), so it lives here. */
  tick: bigint;
  lot: bigint;
  /** Scope every read/trade to the DreamDEX event-contract venue. */
  venueId: Address;
  addresses: {
    collateral: Address;
    binaryModule: Address;
    marketsCore: Address;
    clobFactory: Address;
    binaryPoolImpl: Address;
    binarySettlement: Address;
    collateralRouter: Address;
    marketCreatorFactory: Address;
    oracleHub: Address;
    marketCreator: Address;
  };
  /** Underlying BTC/ETH spot feed. The SDK ships the testnet endpoint
   *  (`SOMNIA_TESTNET_PRICE_FEED`), copied into the testnet preset below; on
   *  mainnet this must be supplied (no bundled endpoint yet). Used by the
   *  croupier's fair-value drift and by `livePrice()` for the app's
   *  "now $77,940 · +$37 ▲" line — settlement never touches it. */
  priceFeedUrl?: string;
}

/** Protocol core — CREATE3, identical across chains. */
const CORE = {
  binaryModule: "0x3ecC694Cef705358864a646142ac17A90E29e388",
  marketsCore: "0x2802504314685D89bF6C992CA5a8e7cC78bc0294",
  clobFactory: "0xb2BE8EE02F96379DB75f01802384593EBa9bfF04",
  binaryPoolImpl: "0x82A1FcdaA2daC2fC7D5f9909D43E68021eE966FD",
  binarySettlement: "0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23",
  collateralRouter: "0xbC0C9834B15ACE38bB50dDaa7d7f7C7CC4DC183C",
  marketCreatorFactory: "0xE6bEE93cE87c9E6e62aCb621caa7832EE47b4F6B",
  oracleHub: "0xe40db387cC98601Dd11bd634fF2f3AD5686dE32b",
} as const;

const ENDPOINTS: Record<Network, { rpc: string; ws: string; indexer: string }> = {
  testnet: {
    rpc: "https://api.infra.testnet.somnia.network",
    ws: "wss://api.infra.testnet.somnia.network/ws",
    indexer: "https://dev.smk.somnia.host/v1/graphql",
  },
  mainnet: {
    rpc: "https://api.infra.mainnet.somnia.network",
    ws: "wss://api.infra.mainnet.somnia.network/ws",
    indexer: "https://prd.smk.somnia.host/v1/graphql",
  },
};

const TESTNET: ChainConfig = {
  network: "testnet",
  chainId: 50312,
  rpcUrl: ENDPOINTS.testnet.rpc,
  wsRpcUrl: ENDPOINTS.testnet.ws,
  indexerUrl: ENDPOINTS.testnet.indexer,
  decimals: 6,
  // testnet accepts orders down to 1 raw unit — effectively no lot/tick constraint.
  tick: 1_000n,
  lot: 1n,
  venueId: "0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c",
  addresses: {
    ...CORE,
    collateral: "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E",
    marketCreator: "0x5Ce69567dB39C8fBAd7e048bEfdbcCdfE67B44e6",
  },
  // The SDK's own SOMNIA_TESTNET_PRICE_FEED, inlined so this module stays pure
  // data. Quote is pinned to USDC by createClient — the feed also carries stale
  // USDT history, and matching both double-counts each base.
  priceFeedUrl: "https://price-feed.dev.oracle.somnia.host/v1/graphql",
};

const MAINNET: ChainConfig = {
  network: "mainnet",
  chainId: 5031,
  rpcUrl: ENDPOINTS.mainnet.rpc,
  wsRpcUrl: ENDPOINTS.mainnet.ws,
  indexerUrl: ENDPOINTS.mainnet.indexer,
  decimals: 18,
  // mainnet USDso venue: 1e15 for both, per venues.json bookParams.
  tick: 1_000_000_000_000_000n,
  lot: 1_000_000_000_000_000n,
  venueId: "0x458b30c2d72bfd2c6317304a4594ecbafe5f729d3111b65fdc3a33bd48e5432d",
  addresses: {
    ...CORE,
    collateral: "0x00000022dA000002656c64D9eA6011ea952D008A",
    marketCreator: "0x62627805965705Cc303A7F6282DD5059921980aD",
  },
};

export const PRESETS: Record<Network, ChainConfig> = { testnet: TESTNET, mainnet: MAINNET };

/** A config for `network`, with optional overrides (venueId is the common one). */
export function resolveConfig(network: Network, overrides: Partial<ChainConfig> = {}): ChainConfig {
  const base = PRESETS[network];
  return {
    ...base,
    ...overrides,
    addresses: { ...base.addresses, ...(overrides.addresses ?? {}) },
  };
}
