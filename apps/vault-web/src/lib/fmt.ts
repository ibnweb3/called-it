import { formatUnits } from "viem";

/** A raw token amount as a plain "1,234.56" string. */
export function usd(raw: bigint, decimals: number): string {
  return Number(formatUnits(raw, decimals)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
