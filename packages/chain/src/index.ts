// @called-it/chain — the one import surface for talking to DreamDEX event
// contracts as "rounds you call". Runs in Node (backend, croupier) and the
// browser (burner-wallet bets).
//
//   import { createClient, resolveConfig, currentRounds, placeCall } from "@called-it/chain";
//
//   const client = createClient(resolveConfig("testnet"), { privateKey: burnerKey });
//   const [round] = await currentRounds(client, "BTC");
//   const receipt = await placeCall(client, { round, side: "UP", chipUsd: 5 });

export { resolveConfig, PRESETS, type ChainConfig, type Network } from "./config.js";
export { createClient, closeClient, assertTxOk, type CalledItClient, type ClientOptions } from "./client.js";
export { currentRounds, roundById, ORACLE_PRICE_DIVISOR } from "./rounds.js";
export { placeCall, type PlaceCallArgs } from "./calls.js";
export { positions } from "./positions.js";
export { livePrice, livePrices, type LivePrice } from "./price.js";
export { settledRounds, claim, claimAll } from "./settlement.js";
export {
  toSteps,
  toRawUnits,
  fromRawUnits,
  quantizeSize,
  clampProbability,
} from "./quantize.js";
export {
  CHIPS,
  type Asset,
  type Side,
  type Round,
  type RoundStatus,
  type CallReceipt,
  type Position,
  type SettledRound,
  type ChipOption,
  type Address,
  type MarketId,
} from "./types.js";
