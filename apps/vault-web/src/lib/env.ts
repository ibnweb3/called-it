// Which network, and which deployed vault to point at. Both default to the
// live testnet deployment so the app builds and hosts with zero config; override
// in apps/vault-web/.env (git-ignored) or the shell for local dev:
//
//   VITE_NETWORK=testnet
//   VITE_VAULT_ADDRESS=0x...
//
// The vault address is public on-chain data, not a secret — safe to commit.

const DEFAULT_VAULT_ADDRESS = "0x10D2Dd3864Eb090Eb89599795c59de228C528DDf";

export const NETWORK = (import.meta.env.VITE_NETWORK ?? "testnet") as "testnet" | "mainnet";
export const IS_TESTNET = NETWORK === "testnet";

export const VAULT_ADDRESS = (import.meta.env.VITE_VAULT_ADDRESS ?? DEFAULT_VAULT_ADDRESS) as `0x${string}` | "";

export const FAUCET_URL = "https://testnet.somnia.network";
