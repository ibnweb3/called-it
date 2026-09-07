// Testnet tUSDC has a public `faucet(uint256)` — anyone can mint to themselves,
// no website, no captcha. This is that call, wrapped for the UI. Mainnet's
// USDso is a real stablecoin with no such function; callers must check
// IS_TESTNET (env.ts) before showing this.

import { parseUnits, type Address, type WalletClient } from "viem";
import { publicClient } from "./wallet";
import { TESTNET_FAUCET_ABI } from "./abi";

/** Mint `amountHuman` tUSDC to `user`. Throws on revert. */
export async function mintTestTUSDC(
  walletClient: WalletClient,
  user: Address,
  tusdcAddress: Address,
  amountHuman: string,
  decimals: number,
): Promise<`0x${string}`> {
  const amount = parseUnits(amountHuman, decimals);
  const hash = await walletClient.writeContract({
    account: user,
    address: tusdcAddress,
    abi: TESTNET_FAUCET_ABI,
    functionName: "faucet",
    args: [amount],
  } as never);
  const receipt = await publicClient().waitForTransactionReceipt({ hash });
  if (receipt.status === "reverted") throw new Error(`faucet reverted: ${hash}`);
  return hash;
}
