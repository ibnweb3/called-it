// All reads and writes against the deployed CalledItFloat vault + its tUSDC
// asset, over raw viem. No backend, no markets SDK — just the two contracts.

import { parseUnits, type Address, type WalletClient } from "viem";
import { publicClient } from "./wallet";
import { VAULT_ABI, ERC20_ABI, MAX_UINT256 } from "./abi";
import { VAULT_ADDRESS } from "./env";

function vaultAddr(): Address {
  if (!VAULT_ADDRESS) throw new Error("VITE_VAULT_ADDRESS is not set — see apps/vault-web/.env.example");
  return VAULT_ADDRESS;
}

export interface VaultReads {
  vaultAddress: Address;
  assetAddress: Address;
  assetDecimals: number;
  shareDecimals: number;
  totalAssets: bigint;
  idleAssets: bigint;
  borrowed: bigint;
  sessionOpen: boolean;
  yourShares: bigint;
  yourValue: bigint; // convertToAssets(yourShares) — what your shares are worth right now
  yourAssetBalance: bigint; // tUSDC in your wallet
  yourAllowance: bigint; // tUSDC allowance you've given the vault
  yourMaxWithdraw: bigint; // capped at idle during an open session — see CalledItFloat.sol
  yourMaxRedeem: bigint;
}

/** Every stat the dashboard shows. `user` is optional — omit for a read-only view. */
export async function readVault(user?: Address): Promise<VaultReads> {
  const client = publicClient();
  const vault = vaultAddr();

  const [assetAddress, shareDecimals, totalAssets, idleAssets, borrowed, sessionOpen] = await Promise.all([
    client.readContract({ address: vault, abi: VAULT_ABI, functionName: "asset" }),
    client.readContract({ address: vault, abi: VAULT_ABI, functionName: "decimals" }),
    client.readContract({ address: vault, abi: VAULT_ABI, functionName: "totalAssets" }),
    client.readContract({ address: vault, abi: VAULT_ABI, functionName: "idleAssets" }),
    client.readContract({ address: vault, abi: VAULT_ABI, functionName: "borrowed" }),
    client.readContract({ address: vault, abi: VAULT_ABI, functionName: "sessionOpen" }),
  ]);

  const assetDecimals = await client.readContract({
    address: assetAddress,
    abi: ERC20_ABI,
    functionName: "decimals",
  });

  let yourShares = 0n;
  let yourValue = 0n;
  let yourAssetBalance = 0n;
  let yourAllowance = 0n;
  let yourMaxWithdraw = 0n;
  let yourMaxRedeem = 0n;

  if (user) {
    [yourShares, yourAssetBalance, yourAllowance, yourMaxWithdraw, yourMaxRedeem] = await Promise.all([
      client.readContract({ address: vault, abi: VAULT_ABI, functionName: "balanceOf", args: [user] }),
      client.readContract({ address: assetAddress, abi: ERC20_ABI, functionName: "balanceOf", args: [user] }),
      client.readContract({
        address: assetAddress,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [user, vault],
      }),
      client.readContract({ address: vault, abi: VAULT_ABI, functionName: "maxWithdraw", args: [user] }),
      client.readContract({ address: vault, abi: VAULT_ABI, functionName: "maxRedeem", args: [user] }),
    ]);
    if (yourShares > 0n) {
      yourValue = await client.readContract({
        address: vault,
        abi: VAULT_ABI,
        functionName: "convertToAssets",
        args: [yourShares],
      });
    }
  }

  return {
    vaultAddress: vault,
    assetAddress,
    assetDecimals,
    shareDecimals,
    totalAssets,
    idleAssets,
    borrowed,
    sessionOpen,
    yourShares,
    yourValue,
    yourAssetBalance,
    yourAllowance,
    yourMaxWithdraw,
    yourMaxRedeem,
  };
}

async function writeAndWait(
  walletClient: WalletClient,
  args: Parameters<WalletClient["writeContract"]>[0],
): Promise<`0x${string}`> {
  const hash = await walletClient.writeContract(args);
  const receipt = await publicClient().waitForTransactionReceipt({ hash });
  if (receipt.status === "reverted") throw new Error(`transaction reverted: ${hash}`);
  return hash;
}

/** Approve the vault for tUSDC if the current allowance won't cover `neededRaw`. */
export async function approveIfNeeded(
  walletClient: WalletClient,
  user: Address,
  assetAddress: Address,
  currentAllowance: bigint,
  neededRaw: bigint,
): Promise<`0x${string}` | null> {
  if (currentAllowance >= neededRaw) return null;
  return writeAndWait(walletClient, {
    account: user,
    address: assetAddress,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [vaultAddr(), MAX_UINT256],
  } as never);
}

export async function depositAssets(
  walletClient: WalletClient,
  user: Address,
  amountHuman: string,
  assetDecimals: number,
): Promise<`0x${string}`> {
  const amount = parseUnits(amountHuman, assetDecimals);
  return writeAndWait(walletClient, {
    account: user,
    address: vaultAddr(),
    abi: VAULT_ABI,
    functionName: "deposit",
    args: [amount, user],
  } as never);
}

/** Redeem every share the caller holds. */
export async function redeemAll(walletClient: WalletClient, user: Address, shares: bigint): Promise<`0x${string}`> {
  return writeAndWait(walletClient, {
    account: user,
    address: vaultAddr(),
    abi: VAULT_ABI,
    functionName: "redeem",
    args: [shares, user, user],
  } as never);
}

export async function withdrawAssets(
  walletClient: WalletClient,
  user: Address,
  amountHuman: string,
  assetDecimals: number,
): Promise<`0x${string}`> {
  const amount = parseUnits(amountHuman, assetDecimals);
  return writeAndWait(walletClient, {
    account: user,
    address: vaultAddr(),
    abi: VAULT_ABI,
    functionName: "withdraw",
    args: [amount, user, user],
  } as never);
}

export interface SessionRow {
  blockNumber: bigint;
  txHash: `0x${string}`;
  principal: bigint;
  returned: bigint;
  prizePaid: bigint;
}

/** Recent settled bot sessions, newest first. The Somnia RPC caps eth_getLogs at
 *  1000 blocks per call, so this pages backwards in sub-1000-block windows until
 *  it has enough rows or has scanned back far enough. */
export async function readRecentSessions(limit = 10): Promise<SessionRow[]> {
  const client = publicClient();
  const vault = vaultAddr();
  const latest = await client.getBlockNumber();

  const WINDOW = 900n; // under the RPC's 1000-block cap
  const MAX_WINDOWS = 12; // ~11k blocks back — a few minutes on Somnia; enough for a demo
  const rows: SessionRow[] = [];

  let toBlock = latest;
  for (let i = 0; i < MAX_WINDOWS && rows.length < limit; i++) {
    const fromBlock = toBlock > WINDOW ? toBlock - WINDOW : 0n;
    try {
      const logs = await client.getContractEvents({
        address: vault,
        abi: VAULT_ABI,
        eventName: "SessionClosed",
        fromBlock,
        toBlock,
      });
      for (const l of logs.reverse()) {
        rows.push({
          blockNumber: l.blockNumber ?? 0n,
          txHash: l.transactionHash ?? ("0x" as `0x${string}`),
          principal: l.args.principal ?? 0n,
          returned: l.args.returned ?? 0n,
          prizePaid: l.args.prizePaid ?? 0n,
        });
      }
    } catch {
      // skip this window on a transient RPC error, keep paging
    }
    if (fromBlock === 0n) break;
    toBlock = fromBlock - 1n;
  }

  return rows.slice(0, limit);
}
