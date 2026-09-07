// The Float hook (Phase 1.4). The croupier borrows working capital from
// CalledItFloat.sol once per session and repays it — principal plus or minus
// what it made — on shutdown or a risk pause. The vault enforces the borrow
// caps (absolute + % of TVL); this file only ever asks for what the vault's
// own `config()` says is allowed, shaved by 1% so a TVL wobble between the
// read and the tx landing never trips the contract's strict on-chain check.
//
// Set CROUPIER_FLOAT=0x<vault address> to activate. Unset (default) keeps the
// old no-op — the croupier trades from its own key, same as Phase 1.1–1.3.

import { makeChain, type EcContext } from "@dreamdex-bot-kit/ec-core";
import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  parseUnits,
  type Address,
  type Chain,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { VAULT_ABI, ERC20_ABI, MAX_UINT256 } from "./vault-abi.js";
import { CFG } from "./config.js";

const log = (s: string) => console.log(`${new Date().toISOString()} ${s}`);

export interface Float {
  /** Pull working capital into the trading key at startup. */
  borrow(ctx: EcContext): Promise<void>;
  /** Return principal + realized PnL. Called on shutdown and on a risk pause. */
  repay(ctx: EcContext): Promise<void>;
  readonly active: boolean;
}

export function loadFloat(): Float {
  const addr = (process.env.CROUPIER_FLOAT ?? "").trim();
  if (!addr) {
    return {
      active: false,
      async borrow() {
        log("float: not configured — croupier trades from its own key");
      },
      async repay() {},
    };
  }
  const vault = addr as Address;

  // Built lazily, once, from the first ctx we see — every call after reuses them.
  let chain: Chain | null = null;
  let publicClient: PublicClient | null = null;
  let walletClient: WalletClient | null = null;
  let account: PrivateKeyAccount | null = null;

  function clientsFor(ctx: EcContext) {
    if (!publicClient) {
      chain = makeChain(ctx.config);
      publicClient = createPublicClient({ chain, transport: http(ctx.config.rpcUrl) });
      if (ctx.config.privateKey) {
        account = privateKeyToAccount(ctx.config.privateKey);
        walletClient = createWalletClient({ account, chain, transport: http(ctx.config.rpcUrl) });
      }
    }
    return { chain: chain!, publicClient, walletClient, account };
  }

  async function settle(
    ctx: EcContext,
    publicClient: PublicClient,
    walletClient: WalletClient,
    account: PrivateKeyAccount,
    chain: Chain,
  ): Promise<void> {
    const before = await publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: "borrowed" });
    const hash = await walletClient.writeContract({
      account,
      chain,
      address: vault,
      abi: VAULT_ABI,
      functionName: "settle",
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === "reverted") throw new Error(`float: settle() reverted — ${hash}`);
    log(`float: settled — principal was ${formatUnits(before, ctx.config.decimals)} tUSDC (${hash})`);
  }

  return {
    active: true,

    async borrow(ctx: EcContext) {
      const { chain, publicClient, walletClient, account } = clientsFor(ctx);
      if (!walletClient || !account) {
        log("float: no PRIVATE_KEY loaded — cannot borrow, trading from own key instead");
        return;
      }

      const config = await publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: "config" });
      if (config.operator.toLowerCase() !== account.address.toLowerCase()) {
        log(
          `float: this wallet (${account.address}) is not the vault's operator ` +
            `(${config.operator}) — skipping, trading from own key instead`,
        );
        return;
      }

      // A crash mid-session leaves borrowed() != 0 on restart. Close it out
      // before asking for a fresh session — the vault refuses a second borrow().
      if (await publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: "sessionOpen" })) {
        log("float: a session was already open (bot restarted mid-session?) — settling it first");
        await settle(ctx, publicClient, walletClient, account, chain);
      }

      const totalAssets = await publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: "totalAssets" });
      const ratioCap = (totalAssets * BigInt(config.maxBorrowRatioBps)) / 10_000n;
      let target = config.maxBorrow < ratioCap ? config.maxBorrow : ratioCap;

      if (CFG.floatTarget > 0) {
        const extraCap = parseUnits(String(CFG.floatTarget), ctx.config.decimals);
        if (extraCap < target) target = extraCap;
      }
      target = (target * 99n) / 100n; // stay clear of the contract's strict on-chain cap check

      if (target <= 0n) {
        log("float: vault is empty (or its caps are zero) — trading from own key instead");
        return;
      }

      const asset = await publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: "asset" });
      const allowance = await publicClient.readContract({
        address: asset,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [account.address, vault],
      });
      if (allowance < target) {
        log("float: approving the vault to pull tUSDC back at settle…");
        const approveHash = await walletClient.writeContract({
          account,
          chain,
          address: asset,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [vault, MAX_UINT256],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      const hash = await walletClient.writeContract({
        account,
        chain,
        address: vault,
        abi: VAULT_ABI,
        functionName: "borrow",
        args: [target],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") throw new Error(`float: borrow(${target}) reverted — ${hash}`);
      log(`float: borrowed ${formatUnits(target, ctx.config.decimals)} tUSDC from ${vault} (${hash})`);
    },

    async repay(ctx: EcContext) {
      const { chain, publicClient, walletClient, account } = clientsFor(ctx);
      if (!walletClient || !account) return;
      if (!(await publicClient.readContract({ address: vault, abi: VAULT_ABI, functionName: "sessionOpen" }))) return;
      await settle(ctx, publicClient, walletClient, account, chain);
    },
  };
}
