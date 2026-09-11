# Called It croupier — the market-maker bot. A long-running background
# process with NO http port — it just borrows the vault's float and quotes
# DreamDEX event contracts forever. Build from the REPO ROOT:
#
#   docker build -f apps/croupier/Dockerfile -t calledit-croupier .

FROM node:22-slim

WORKDIR /app

# Manifests first, so a code change doesn't bust the dependency layer.
COPY package.json package-lock.json ./
COPY packages/curve/package.json ./packages/curve/
COPY packages/ec-core/package.json ./packages/ec-core/
COPY apps/croupier/package.json ./apps/croupier/

# Only the croupier and its two workspace deps — no vite/react/backend.
RUN npm ci --workspace croupier --workspace @called-it/curve --workspace @dreamdex-bot-kit/ec-core \
      --include-workspace-root --ignore-scripts

# Sources.
COPY tsconfig.base.json ./
COPY packages/curve ./packages/curve
COPY packages/ec-core ./packages/ec-core
COPY apps/croupier ./apps/croupier

ENV NODE_ENV=production
# No .env file in the image — every var below comes from the platform's real
# environment (Koyeb/Fly/systemd secrets, never committed, never baked in).

# Run tsx directly — NOT through `npm start` — so the process that receives
# the platform's stop signal (SIGTERM on a redeploy, a restart, a scale event)
# IS the bot itself, and its graceful-shutdown path (settle the open session
# with the vault, THEN exit) actually gets to run. A signal that has to pass
# through an npm/shell wrapper can be delayed or dropped entirely — which is
# exactly what orphaned a session during testing on Windows.
CMD ["node_modules/.bin/tsx", "apps/croupier/src/index.ts"]
