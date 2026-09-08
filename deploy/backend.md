# Deploying the squads backend (free)

The demo game runs a local round engine — no backend needed to play. The backend
exists for **one job**: making squads and the global leaderboard *shared* instead
of per-browser, so an invite link works across devices. It runs in `SOCIAL_ONLY`
mode: auth + `/v1/rooms/*` + `/v1/leaderboard` + `/v1/calls/demo`, no chain, no
indexer, no WebSocket.

```
apps/backend/Dockerfile   — build from the repo root
SOCIAL_ONLY=1             — the only mode that matters here
```

## Environment variables

| var | value | notes |
|---|---|---|
| `SOCIAL_ONLY` | `1` | already set in the Dockerfile |
| `JWT_SECRET` | a long random string | `openssl rand -hex 32` |
| `CORS_ORIGIN` | `https://calledit-somnia.pages.dev` | the Pages site; `*` also works |
| `PORT` | host-provided | Koyeb/Render inject this; the app binds `0.0.0.0:$PORT` |
| `DATABASE_PATH` | `/tmp/called-it.db` (default) or a volume path | see **Persistence** |
| `NETWORK` | `testnet` | unused in social-only, keep it set |

## Persistence — read this first

In `SOCIAL_ONLY` mode the SQLite file **is the only copy** of rooms, members and
streaks — there's no chain to rebuild it from. So:

- **A host with a persistent disk** (Oracle VM, a Fly volume, Render paid disk):
  point `DATABASE_PATH` at it and you're done.
- **A host with only ephemeral disk** (Koyeb free, Render free): squads survive
  restarts *only* as long as the container isn't recycled. Keep it warm with an
  uptime pinger (below); a redeploy still wipes it, which after submission you
  rarely do.

---

## Option A — Koyeb (fastest, ephemeral)

Free web service: 512 MB / 0.1 vCPU, Node 22, usually no card. Scales to zero
after 1 h idle (≈ one cold start on wake — the app's reconnect UI covers it).

1. Push this repo to GitHub (already done: `github.com/ibnweb3/called-it`).
2. [koyeb.com](https://www.koyeb.com) → **Create Web Service** → GitHub → this repo.
3. Builder: **Dockerfile**. Dockerfile location: `apps/backend/Dockerfile`.
   Work directory / context: repo root (leave blank).
4. Instance: **Free**. Region: Frankfurt or Washington.
5. Environment variables: `JWT_SECRET`, `CORS_ORIGIN` (from the table above).
6. Health check: HTTP `GET /health`. Port `8000`.
7. Deploy. Note the public URL, e.g. `https://called-it-<you>.koyeb.app`.
8. **Keep it warm:** [cron-job.org](https://console.cron-job.org) (free) → new job →
   `GET https://<your-url>/health` every 10 min. Stops the scale-to-zero wipe.

## Option B — Oracle Cloud Always Free (persistent, never sleeps)

A real ARM VM (up to 4 cores / 24 GB, free forever). Card required at signup;
capacity in some regions is tight — pick a region that has Ampere A1 available.

```bash
# on the VM (Ubuntu 22.04+):
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs git
git clone https://github.com/ibnweb3/called-it && cd called-it
npm ci --workspace backend --workspace @called-it/chain --include-workspace-root --ignore-scripts

sudo npm i -g pm2
SOCIAL_ONLY=1 JWT_SECRET=$(openssl rand -hex 32) CORS_ORIGIN=https://calledit-somnia.pages.dev \
  DATABASE_PATH=/home/ubuntu/called-it.db PORT=8000 \
  pm2 start "npm start --workspace backend" --name calledit-backend
pm2 save && pm2 startup   # survive reboots
```

Open port 8000 in the VM's security list + `sudo ufw allow 8000`. Put it behind
Caddy/nginx for TLS, or use a Cloudflare Tunnel (free) to get an HTTPS hostname
without touching certs.

## Option C — Fly.io (persistent, ~$2/mo)

Not free since Oct 2024, but the least-effort *always-on + persistent* path:
`fly launch --dockerfile apps/backend/Dockerfile`, `fly volumes create data`,
mount at `/data`, set `DATABASE_PATH=/data/called-it.db`.

---

## Wire the frontend to it

Once the backend has a public HTTPS URL:

```bash
# apps/web/.env  (git-ignored) — or set in the Cloudflare Pages build env
NEXT_PUBLIC_SQUADS_URL=https://<your-backend-url>
```

Then redeploy the site:

```bash
npm run deploy   # rebuilds web + vault-web, redeploys calledit-somnia.pages.dev
```

With `NEXT_PUBLIC_SQUADS_URL` set, the demo game:

- asks the connected wallet to sign a one-line login the first time you open a
  squad (real proof of the address — no key is held anywhere);
- routes create / join / view squad and the global leaderboard through the
  backend, so `…/r/<id>` works on any device;
- reports each settled play-money call (not practice rounds) so a squad's weekly
  board and the leaderboard are the same for everyone in the room.

Unset it and squads fall back to single-device local (the current behaviour).

## Smoke test

```bash
curl https://<url>/health
# {"ok":true,"network":"testnet","mode":"social-only",...}
curl https://<url>/v1/leaderboard
# {"leaderboard":[]}
```
