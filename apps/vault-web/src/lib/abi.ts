// Hand-written interface fragments — just the pieces this page reads/writes.
// Mirrors apps/croupier/src/vault-abi.ts; duplicating this small a slice in the
// bot and the dashboard is fine for a hackathon build.

import { parseAbi } from "viem";

export const VAULT_ABI = parseAbi([
  "function asset() view returns (address)",
  "function decimals() view returns (uint8)",
  "function totalAssets() view returns (uint256)",
  "function idleAssets() view returns (uint256)",
  "function sharePrice() view returns (uint256)",
  "function sessionOpen() view returns (bool)",
  "function borrowed() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function maxWithdraw(address owner) view returns (uint256)",
  "function maxRedeem(address owner) view returns (uint256)",
  "function deposit(uint256 assets, address receiver) returns (uint256 shares)",
  "function withdraw(uint256 assets, address receiver, address owner) returns (uint256 shares)",
  "function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets)",
  "event SessionOpened(uint256 amount, uint64 deadline)",
  "event SessionClosed(uint256 principal, uint256 returned, uint256 prizePaid)",
]);

export const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
]);

// Testnet tUSDC is a public, permissionless faucet token — anyone can mint to
// themselves. Mainnet's USDso has no such function; this ABI is only ever
// reached from the faucet card, which itself only renders on testnet.
export const TESTNET_FAUCET_ABI = parseAbi(["function faucet(uint256 amount)"]);

export const MAX_UINT256 = (1n << 256n) - 1n;
