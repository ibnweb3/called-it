// Two things this page needs from outside: which network, and which deployed
// vault to point at. Set in apps/vault-web/.env (git-ignored) or the shell:
//
//   VITE_NETWORK=testnet
//   VITE_VAULT_ADDRESS=0x...   (printed by contracts/script/Deploy.s.sol)

export const NETWORK = (import.meta.env.VITE_NETWORK ?? "testnet") as "testnet" | "mainnet";
export const IS_TESTNET = NETWORK === "testnet";

export const VAULT_ADDRESS = (import.meta.env.VITE_VAULT_ADDRESS ?? "") as `0x${string}` | "";

export const FAUCET_URL = "https://testnet.somnia.network";
