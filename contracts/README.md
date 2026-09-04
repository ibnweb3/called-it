# Called It — contracts

Foundry project. One contract: **`CalledItFloat`** — the community liquidity
vault behind Called It ("the Float").

```bash
# needs Foundry — https://getfoundry.sh  (curl -L https://foundry.paradigm.xyz | bash && foundryup)
cd contracts
forge test            # 20 tests
forge test --gas-report
FOUNDRY_PROFILE=ci forge test   # 1000 fuzz runs
```

`lib/` (OpenZeppelin v5.1.0, forge-std) is committed, so a fresh clone builds
with no `forge install`.

## CalledItFloat

ERC-4626 vault. Depositors put in USDso, get shares. The Croupier bot
(`operator`) borrows a working float once per trading session and returns it —
plus/minus what it made making a market — at session end.

### Accounting — one session at a time

`totalAssets = idle USDso + borrowed` (principal out with the Croupier).

| Call | Who | Effect |
|---|---|---|
| `deposit` / `mint` | anyone (blocked while paused) | shares in |
| `withdraw` / `redeem` | anyone (**never** blocked) | shares out, from idle only |
| `borrow(amount)` | operator | float → `croupierWallet`; records principal; share price unchanged |
| `settle()` | operator | sweep the **whole** croupier wallet back, realize P&L, pay prize cut |
| `forceClose()` | **anyone**, after `maxSessionDuration` | recover what's left, write off the rest |
| `sweepCroupierDust()` | owner, between sessions | pull any stray asset from the croupier wallet |
| `proposeConfig` / `applyConfig` | owner proposes, anyone applies after 24h | change operator / caps / prize |
| `pause` / `unpause` | owner | stop deposits (not withdrawals) |

### Why depositor funds are safe from the operator

- `borrow()` only ever sends to the owner-set `croupierWallet`, never `msg.sender`.
- `settle()` takes no amount — it sweeps the **entire** croupier-wallet balance,
  so a compromised operator key can't crash the share price by understating a loss.
- Every rug-relevant parameter changes only through a **24h timelock**.
- Withdrawals are never pausable; the **50%-of-TVL borrow cap** keeps enough idle
  to exit against mid-session.
- Hard ceilings in code: prize ≤ 20% of profit, borrow ≤ 50% of TVL, session ≤ 7 days.
- 1e6 virtual-share offset against the ERC-4626 inflation attack.

### Still at risk

A bad trading session lowers the share price for everyone — that's the point of
the Float. A depositor holding > 50% of TVL can't fully exit mid-session; they
wait for the next `settle()`.

## Deploy

```bash
forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://api.infra.testnet.somnia.network \
  --private-key $DEPLOYER_KEY --broadcast
```

Env vars: `FLOAT_ASSET`, `FLOAT_OWNER`, `FLOAT_OPERATOR`, `FLOAT_CROUPIER_WALLET`,
`FLOAT_PRIZE_POOL`, and optional `FLOAT_PRIZE_BPS` / `FLOAT_MAX_BORROW` /
`FLOAT_MAX_RATIO_BPS` / `FLOAT_MAX_SESSION_H`. After deploy, **the croupier wallet
must `approve(vault, max)`** for the asset so `settle()` can pull.

## Not audited

Educational. Testnet first.
