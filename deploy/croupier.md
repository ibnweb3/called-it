# Running the croupier in the cloud

The bot is a long-running background process (no web port) — it needs a host
that keeps a process alive indefinitely, not a "web service" that sleeps
without HTTP traffic. That rules out Koyeb's free tier (workers aren't
available on it at all) and Render's free tier (web-services-only, no free
background workers).

`apps/croupier/Dockerfile` is ready and tested (builds from the repo root,
installs only the croupier + its two workspace deps, ~130 packages). It execs
`tsx` directly — not through `npm start` — so the platform's stop signal
reaches the bot itself and its graceful shutdown (settle the open session,
then exit) actually runs on a restart or redeploy.

## Option A — Oracle Cloud Always Free (recommended: actually free, never sleeps)

A real ARM VM, free forever, no traffic-based sleep. Card required at signup
(not charged on the free tier); pick a region where Ampere A1 capacity is
available if the default one is full.

```bash
# on the VM (Ubuntu 22.04+)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs git
git clone https://github.com/ibnweb3/called-it && cd called-it
npm ci --workspace croupier --workspace @called-it/curve --workspace @dreamdex-bot-kit/ec-core --include-workspace-root --ignore-scripts

sudo npm i -g pm2
cat > croupier.env <<'EOF'
NETWORK=testnet
DRY_RUN=false
CROUPIER_FAIR=curve
MM_LOT=1000
FAUCET_ENABLED=false
MM_INVENTORY=3
CROUPIER_QUOTE_SIZE=8
CROUPIER_FLOAT_CYCLE_MS=1800000
CROUPIER_MAX_DAY_LOSS=500
CROUPIER_MAX_WINDOW_SEC=0
CROUPIER_FLOAT=0xED23B3B28bECB8AF4dA4928e91E89B86E2B7e262
VENUE_ID=0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c
FLOAT_OPERATOR=0x31Fd1429eC6280BdaC1338221444167911549Fc1
FLOAT_CROUPIER_WALLET=0x31Fd1429eC6280BdaC1338221444167911549Fc1
FLOAT_ASSET=0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E
FLOAT_OWNER=0x8BE860A6ce4696BBa9eB35C64D340b7d7E698113
FLOAT_PRIZE_POOL=0x8BE860A6ce4696BBa9eB35C64D340b7d7E698113
FLOAT_PRIZE_BPS=1000
FLOAT_MAX_BORROW=100000000
FLOAT_MAX_RATIO_BPS=5000
FLOAT_MAX_SESSION_H=26
EOF
echo "PRIVATE_KEY=0x<paste the bot wallet's key here yourself — never send it to me>" >> croupier.env
chmod 600 croupier.env

pm2 start "node_modules/.bin/tsx apps/croupier/src/index.ts" --name croupier --env-from-file croupier.env \
  || (set -a && source croupier.env && set +a && pm2 start "node_modules/.bin/tsx apps/croupier/src/index.ts" --name croupier)
pm2 save && pm2 startup   # survives a VM reboot
pm2 logs croupier         # watch it borrow + quote
```

(`pm2` versions differ on `--env-from-file`; the `||` fallback just sources the
file into the shell first — either way `pm2 logs croupier` is how you confirm
it's alive.)

## Option B — Fly.io (fastest, ~$2/mo — no free tier since Oct 2024)

```bash
fly launch --dockerfile apps/croupier/Dockerfile --no-deploy
fly secrets set PRIVATE_KEY=0x...                 # paste it into the CLI prompt/flag yourself
fly secrets set NETWORK=testnet DRY_RUN=false CROUPIER_FAIR=curve MM_LOT=1000 \
  FAUCET_ENABLED=false MM_INVENTORY=3 CROUPIER_QUOTE_SIZE=8 CROUPIER_FLOAT_CYCLE_MS=1800000 \
  CROUPIER_MAX_DAY_LOSS=500 CROUPIER_MAX_WINDOW_SEC=0 \
  CROUPIER_FLOAT=0xED23B3B28bECB8AF4dA4928e91E89B86E2B7e262 \
  VENUE_ID=0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c \
  FLOAT_OPERATOR=0x31Fd1429eC6280BdaC1338221444167911549Fc1 \
  FLOAT_CROUPIER_WALLET=0x31Fd1429eC6280BdaC1338221444167911549Fc1 \
  FLOAT_ASSET=0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E \
  FLOAT_OWNER=0x8BE860A6ce4696BBa9eB35C64D340b7d7E698113 \
  FLOAT_PRIZE_POOL=0x8BE860A6ce4696BBa9eB35C64D340b7d7E698113 \
  FLOAT_PRIZE_BPS=1000 FLOAT_MAX_BORROW=100000000 FLOAT_MAX_RATIO_BPS=5000 FLOAT_MAX_SESSION_H=26
fly deploy
fly logs
```

## Either way

- **`PRIVATE_KEY` goes in the platform's own secret store, typed or pasted by
  you directly** — never into a file I write or a message to me.
- Watch the first few minutes of logs for `float: borrowed … tUSDC from
  0xED23B3B2…` then a `quote …` line — that's the whole thing working.
- If you ever need to stop it and reclaim the float by hand: `cast send
  0xED23B3B28bECB8AF4dA4928e91E89B86E2B7e262 "settle()" --private-key
  $PRIVATE_KEY --rpc-url https://api.infra.testnet.somnia.network`.
