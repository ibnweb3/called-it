// Connect an injected EVM wallet (MetaMask, OKX Wallet, Rabby, Coinbase…) and
// use it as the player's identity AND signer. This replaces the old burner
// wallet: the app never holds a private key any more — every call is signed in
// the player's own wallet, on Somnia.
//
// Only the injected (EIP-1193 `window.ethereum`) path is wired. No WalletConnect,
// no in-app key. If there is no injected provider the app says so plainly rather
// than inventing a wallet.

import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  formatEther,
  formatUnits,
  getAddress,
  http,
  parseUnits,
  type Address,
  type EIP1193Provider,
  type WalletClient,
} from "viem";
import { resolveConfig } from "@chain/config";
import { NETWORK } from "./env";
import { PlayerFacingError } from "./gateway";
import type { Balances } from "./types";

declare global {
  interface Window {
    ethereum?: EIP1193Provider & { providers?: EIP1193Provider[]; isMetaMask?: boolean };
  }
}

export const chainConfig = resolveConfig(NETWORK);

const EXPLORER =
  NETWORK === "mainnet"
    ? "https://explorer.somnia.network"
    : "https://shannon-explorer.somnia.network";

export const somnia = defineChain({
  id: chainConfig.chainId,
  name: NETWORK === "mainnet" ? "Somnia" : "Somnia Shannon",
  nativeCurrency: { name: "Somnia", symbol: NETWORK === "mainnet" ? "SOMI" : "STT", decimals: 18 },
  rpcUrls: { default: { http: [chainConfig.rpcUrl] } },
  blockExplorers: { default: { name: "Somnia Explorer", url: EXPLORER } },
});

export const GAS_SYMBOL = somnia.nativeCurrency.symbol;
export const STAKE_SYMBOL = NETWORK === "mainnet" ? "USDso" : "tUSDC";

const HEX_CHAIN = `0x${chainConfig.chainId.toString(16)}`;
const LAST_ADDR = "calledit.wallet";

export interface Connection {
  address: Address;
  chainId: number;
  walletClient: WalletClient;
}

// --------------------------------------------------------------- provider ---

/** The injected provider, preferring MetaMask when several are jammed together. */
function pickProvider(): EIP1193Provider | null {
  const eth = window.ethereum;
  if (!eth) return null;
  if (Array.isArray(eth.providers) && eth.providers.length > 0) {
    return (
      eth.providers.find((p) => (p as { isMetaMask?: boolean }).isMetaMask) ?? eth.providers[0] ?? eth
    );
  }
  return eth;
}

export function hasInjectedWallet(): boolean {
  return pickProvider() !== null;
}

function clientFor(provider: EIP1193Provider, address: Address): WalletClient {
  return createWalletClient({ account: address, chain: somnia, transport: custom(provider) });
}

/** Turn a wallet/RPC rejection into something a player can act on. */
function asPlayerError(err: unknown, fallback: string): PlayerFacingError {
  const code = (err as { code?: number }).code;
  const msg = String((err as Error)?.message ?? "");
  if (code === 4001 || /user rejected|user denied|denied/i.test(msg)) {
    return new PlayerFacingError("Cancelled in your wallet", "Approve the request to keep going.");
  }
  return new PlayerFacingError(fallback, msg.slice(0, 120) || undefined);
}

/** Ask the wallet to be on Somnia — switching, or adding it first if unknown. */
export async function ensureSomnia(): Promise<void> {
  const provider = pickProvider();
  if (!provider) throw new PlayerFacingError("No wallet connected");

  const current = (await provider.request({ method: "eth_chainId" }).catch(() => null)) as
    | string
    | null;
  if (current && current.toLowerCase() === HEX_CHAIN.toLowerCase()) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: HEX_CHAIN as `0x${string}` }],
    });
  } catch (err) {
    const code = (err as { code?: number }).code;
    const unknownChain = code === 4902 || /unrecognized chain|not been added/i.test(String((err as Error)?.message));
    if (!unknownChain) throw asPlayerError(err, `Switch your wallet to ${somnia.name} to play`);
    await provider
      .request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: HEX_CHAIN as `0x${string}`,
            chainName: somnia.name,
            nativeCurrency: somnia.nativeCurrency,
            rpcUrls: [chainConfig.rpcUrl],
            blockExplorerUrls: [EXPLORER],
          },
        ],
      })
      .catch((e) => {
        throw asPlayerError(e, `Add ${somnia.name} to your wallet to play`);
      });
  }
}

/** Prompt for an account. `switchChain: false` skips the network switch (demo). */
export async function connect(opts: { switchChain?: boolean } = {}): Promise<Connection> {
  const provider = pickProvider();
  if (!provider) {
    throw new PlayerFacingError(
      "No wallet found",
      "Install MetaMask, OKX Wallet or Rabby, then reload the page.",
    );
  }

  let accounts: string[];
  try {
    accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  } catch (err) {
    throw asPlayerError(err, "Couldn't reach your wallet");
  }
  if (!accounts?.[0]) {
    throw new PlayerFacingError("No account to connect", "Unlock your wallet and try again.");
  }

  if (opts.switchChain !== false) await ensureSomnia();

  const address = getAddress(accounts[0]);
  try {
    localStorage.setItem(LAST_ADDR, address);
  } catch {
    /* private mode — no silent reconnect next time, that's all */
  }
  return { address, chainId: chainConfig.chainId, walletClient: clientFor(provider, address) };
}

/** Reconnect on reload without a prompt — only if the wallet still authorizes us. */
export async function restore(): Promise<Connection | null> {
  const provider = pickProvider();
  if (!provider) return null;

  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_ADDR);
  } catch {
    /* ignore */
  }
  if (!last) return null;

  try {
    const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
    const match = accounts?.find((a) => getAddress(a) === getAddress(last as string));
    if (!match) return null;
    const address = getAddress(match);
    return { address, chainId: chainConfig.chainId, walletClient: clientFor(provider, address) };
  } catch {
    return null;
  }
}

export function forget(): void {
  try {
    localStorage.removeItem(LAST_ADDR);
  } catch {
    /* ignore */
  }
}

/** Fire `handler` when the wallet switches account or chain. Returns an unsubscribe. */
export function onWalletChange(handler: () => void): () => void {
  const provider = pickProvider();
  if (!provider?.on) return () => undefined;
  const cb = () => handler();
  provider.on("accountsChanged", cb);
  provider.on("chainChanged", cb);
  return () => {
    provider.removeListener?.("accountsChanged", cb);
    provider.removeListener?.("chainChanged", cb);
  };
}

/** The exact string apps/backend/src/auth.ts re-derives (checksummed address). */
export async function signLogin(conn: Connection, issuedAt: number): Promise<`0x${string}`> {
  const message = `Called It login\n${conn.address}\n${issuedAt}`;
  return conn.walletClient.signMessage({ account: conn.address, message });
}

/** Offer to add the stake token to the wallet's asset list. Best-effort. */
export async function watchStakeToken(): Promise<void> {
  const provider = pickProvider();
  if (!provider) return;
  await provider.request({
    method: "wallet_watchAsset",
    params: {
      type: "ERC20",
      options: {
        address: chainConfig.addresses.collateral,
        symbol: STAKE_SYMBOL,
        decimals: chainConfig.decimals,
      },
    },
  } as never);
}

// --------------------------------------------------------------- balances ---

const publicClient = () => createPublicClient({ chain: somnia, transport: http(chainConfig.rpcUrl) });

const ERC20 = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** Stake balance + gas balance for the connected address. */
export async function fetchBalances(address: Address): Promise<Balances> {
  const client = publicClient();
  const [gasWei, stakeRaw] = await Promise.all([
    client.getBalance({ address }),
    client.readContract({
      address: chainConfig.addresses.collateral,
      abi: ERC20,
      functionName: "balanceOf",
      args: [address],
    }),
  ]);
  return {
    usd: Number(formatUnits(stakeRaw as bigint, chainConfig.decimals)),
    gas: Number(formatEther(gasWei)),
  };
}

export const parseStake = (amount: string) => parseUnits(amount, chainConfig.decimals);
