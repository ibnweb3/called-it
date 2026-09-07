# Deploying the front-ends to Cloudflare Pages

Two static sites, both plain Vite builds, both **zero-config** — the vault address
and network are baked in as public defaults, so nothing secret and no environment
variables to set.

| Site | App | What it is | Pages project |
|---|---|---|---|
| Housepool dashboard | `apps/vault-web` | deposit / withdraw / session P&L, reads the live vault over viem | `housepool` |
| Called It game | `apps/web` | the tap-UP/DOWN PWA, runs in self-contained demo mode | `called-it` |

Wrangler is already a dev dependency (`npm install` at the repo root pulls it).

## One-time setup

```bash
npx wrangler login                       # opens a browser, authorize the CLI
npx wrangler pages project create housepool --production-branch main
npx wrangler pages project create called-it --production-branch main
```

## Deploy (run any time)

```bash
npm run deploy:vault-web                  # builds apps/vault-web + uploads apps/vault-web/dist
npm run deploy:web                        # builds apps/web + uploads apps/web/dist
```

Each prints a `https://<hash>.<project>.pages.dev` preview URL and, on the
production branch, promotes to `https://<project>.pages.dev`.

The deploy scripts are:

```
deploy:vault-web  →  npm run build -w vault-web && wrangler pages deploy apps/vault-web/dist --project-name housepool --branch main --commit-dirty=true
deploy:web        →  npm run build -w web       && wrangler pages deploy apps/web/dist       --project-name called-it --branch main --commit-dirty=true
```

`--commit-dirty=true` just silences the "you have uncommitted changes" note on a
direct upload; it doesn't touch git.

## After the first deploy

1. Copy the two `*.pages.dev` URLs into [`README.md`](../README.md) (the "Live on
   testnet" table) and the BUIDL submission.
2. Cross-link the two sites — a "Back the house →" button in the game pointing at
   the Housepool URL, a "Play →" button in the dashboard pointing at the game.
   (Both are single-line `<a href>` additions.)

## SPA routing

Each `public/_redirects` ships `/*  /index.html  200` so a refresh or deep link
resolves to the app instead of a 404.

## If you'd rather connect the Git repo (auto-deploy on push)

In the Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git →
pick `ibnweb3/called-it`, then per project:

| | `housepool` | `called-it` |
|---|---|---|
| Build command | `npm run build -w vault-web` | `npm run build -w web` |
| Build output directory | `apps/vault-web/dist` | `apps/web/dist` |
| Root directory | `/` | `/` |

No environment variables required for either.

## Live mode for the game (later, optional)

`apps/web` deploys in **demo mode** by default (local round engine, play money —
fully standalone). Pointing it at the real chain needs `apps/backend` (indexer +
REST/WS API) deployed somewhere persistent and `VITE_MODE=live` +
`VITE_API_URL=...` set on the Pages project. Out of scope for the initial
submission — the dashboard already shows real on-chain vault state.
