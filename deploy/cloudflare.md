# Hosting — Cloudflare Pages

Both front-ends ship as **one site** from a single Pages project:

| URL | App | What it is |
|---|---|---|
| `calledit-somnia.pages.dev/` | `apps/web` | the game — tap UP/DOWN, runs self-contained in demo mode |
| `calledit-somnia.pages.dev/house` | `apps/vault-web` | Housepool — deposit / withdraw / session P&L, reads the live vault |

Zero config — the vault address and network are baked in as public defaults, and
the game runs demo mode with no backend.

## How the single deploy works

`npm run deploy` runs [`site:build`](../package.json) then uploads `deploy/dist`:

1. `vite build` the game → `apps/web/dist`
2. `vite build` the dashboard with `BASE=/house/` → `apps/vault-web/dist`
3. [`deploy/assemble.mjs`](assemble.mjs) lays them out:
   ```
   deploy/dist/          <- the game
   deploy/dist/house/    <- Housepool
   deploy/dist/_redirects   /house/*  /house/index.html  200
                            /*        /index.html        200
   ```
4. `wrangler pages deploy deploy/dist --project-name calledit-somnia --branch main`

`deploy/dist/` is git-ignored (rebuilt every deploy).

## One-time setup

```bash
npx wrangler login
npx wrangler pages project create calledit-somnia --production-branch main
```

(`called-it`, `calledit`, and `housepool` bare subdomains were all taken on
`pages.dev`, so the project is `calledit-somnia`.)

## Deploy (any time)

```bash
npm run deploy
```

Prints a per-deploy `https://<hash>.calledit-somnia.pages.dev` and, on `main`,
promotes to `https://calledit-somnia.pages.dev`.

## Live mode for the game (later, optional)

`apps/web` deploys in demo mode (local round engine, play money — standalone).
Real-chain play needs `apps/backend` (indexer + REST/WS API) hosted somewhere
persistent, plus `VITE_MODE=live` + `VITE_API_URL=…` on the build. Out of scope
for the initial submission — the `/house` dashboard already shows real on-chain
vault state.
