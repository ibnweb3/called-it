// Connect an injected EVM wallet (MetaMask, OKX Wallet, Rabby…) and use it to
// sign vault deposits/withdrawals. Only the injected (EIP-1193 window.ethereum)
// path is wired — no WalletConnect, no in-app key. Trimmed from
// apps/web/src/lib/wallet.ts (same pattern, game-specific bits dropped).

import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  getAddress,
  http,
  type Address,
  type EIP1193Provider,
  type PublicClient,
  type WalletClient,
} from "viem";
import { resolveConfig } from "@chain/config";
import { NETWORK } from "./env";

declare global {
  interface Window {
    ethereum?: EIP1193Provider & { providers?: EIP1193Provider[]; isMetaMask?: boolean };
  }
}

export class WalletError extends Error {
  constructor(message: string, public hint?: string) {
    super(message);
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
const LAST_ADDR = "housepool.wallet";

export interface Connection {
  address: Address;
  chainId: number;
  walletClient: WalletClient;
}

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

/** Turn a wallet/RPC rejection into something a person can act on. */
function asWalletError(err: unknown, fallback: string): WalletError {
  const code = (err as { code?: number }).code;
  const msg = String((err as Error)?.message ?? "");
  if (code === 4001 || /user rejected|user denied|denied/i.test(msg)) {
    return new WalletError("Cancelled in your wallet", "Approve the request to keep going.");
  }
  return new WalletError(fallback, msg.slice(0, 160) || undefined);
}

/** Ask the wallet to be on Somnia — switching, or adding it first if unknown. */
export async function ensureSomnia(): Promise<void> {
  const provider = pickProvider();
  if (!provider) throw new WalletError("No wallet connected");

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
    const unknownChain =
      code === 4902 || /unrecognized chain|not been added/i.test(String((err as Error)?.message));
    if (!unknownChain) throw asWalletError(err, `Switch your wallet to ${somnia.name}`);
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
        throw asWalletError(e, `Add ${somnia.name} to your wallet`);
      });
  }
}

/** Prompt for an account and switch to Somnia. */
export async function connect(): Promise<Connection> {
  const provider = pickProvider();
  if (!provider) {
    throw new WalletError("No wallet found", "Install MetaMask, OKX Wallet or Rabby, then reload.");
  }

  let accounts: string[];
  try {
    accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  } catch (err) {
    throw asWalletError(err, "Couldn't reach your wallet");
  }
  if (!accounts?.[0]) {
    throw new WalletError("No account to connect", "Unlock your wallet and try again.");
  }

  await ensureSomnia();

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

let _publicClient: PublicClient | null = null;
/** Shared read client — reused across reads instead of re-created per call. */
export function publicClient(): PublicClient {
  if (!_publicClient) {
    _publicClient = createPublicClient({ chain: somnia, transport: http(chainConfig.rpcUrl) });
  }
  return _publicClient;
}
