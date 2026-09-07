// A small hand-written slice of CalledItFloat.sol + the ERC-20 asset it
// holds — just the pieces the croupier reads/writes. Mirrors
// apps/vault-web/src/lib/abi.ts; duplicating this small an interface in the
// bot and the dashboard is fine for a hackathon build.

import { parseAbi } from "viem";

export const VAULT_ABI = parseAbi([
  "function asset() view returns (address)",
  "function totalAssets() view returns (uint256)",
  "function borrowed() view returns (uint256)",
  "function sessionOpen() view returns (bool)",
  "function config() view returns ((address operator, address croupierWallet, address prizePool, uint16 prizeBps, uint256 maxBorrow, uint16 maxBorrowRatioBps, uint64 maxSessionDuration))",
  "function borrow(uint256 amount)",
  "function settle()",
]);

export const ERC20_ABI = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

export const MAX_UINT256 = (1n << 256n) - 1n;
