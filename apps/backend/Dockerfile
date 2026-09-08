# Called It backend — the SOCIAL_ONLY squads + leaderboard service for the
# demo-mode web app. Build from the REPO ROOT (this is an npm-workspaces
# monorepo):
#
#   docker build -f apps/backend/Dockerfile -t calledit-backend .
#
# On Koyeb / Render / Fly: set the Dockerfile path to `apps/backend/Dockerfile`
# and leave the build context as the repo root.

FROM node:22-slim

WORKDIR /app

# Manifests first, so a code change doesn't bust the dependency layer.
COPY package.json package-lock.json ./
COPY packages/chain/package.json ./packages/chain/
COPY apps/backend/package.json ./apps/backend/

# Only the backend and its one workspace dep — no vite / react / croupier.
RUN npm ci --workspace backend --workspace @called-it/chain \
      --include-workspace-root --ignore-scripts

# Sources.
COPY tsconfig.base.json ./
COPY packages/chain ./packages/chain
COPY apps/backend ./apps/backend

ENV NODE_ENV=production
ENV SOCIAL_ONLY=1
ENV PORT=8000
# The SQLite file. In SOCIAL_ONLY mode this holds the squads/leaderboard state
# and is NOT rebuildable — put it on a persistent volume if the host offers one,
# otherwise squads reset on a cold start (see deploy/backend.md).
ENV DATABASE_PATH=/tmp/called-it.db
EXPOSE 8000

# tsx runs the TS entrypoint directly.
CMD ["npm", "start", "--workspace", "backend"]
