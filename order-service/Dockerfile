# syntax=docker/dockerfile:1
#
# AI Assistance Disclosure:
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-09-23
# Scope: Project scaffolding / infrastructure only. No requirements,
#        architecture, schema, or API decisions were made by the AI tool.
# Author review: george-yeo
# Tool: Codex (model: GPT-6), date: 2026-11-05
# Scope: Copied the existing postinstall script before dependency installation.
# No requirements, architecture, schema, or API decisions were made by the AI tool.
# Author review: tng wen xi
# Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
# Scope: ECS Fargate migration - add the RDS CA bundle to the production stage, per
#        George's ECS Fargate plan, Phase 1 item 4. No requirements, architecture,
#        schema, or API decisions were made by the AI tool.
# Author review: George Yeo
#
# Targets:
#   dev         -> hot-reload image used by ../compose.dev.yaml
#   production  -> slim runtime image (default)

ARG NODE_VERSION=24

# ---- base: OS deps shared by every stage -----------------------------------
FROM node:${NODE_VERSION}-slim AS base
# Prisma's schema engine (used by `migrate deploy`) needs OpenSSL.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- deps: full install, cached until the lockfile changes ------------------
FROM base AS deps
COPY package.json package-lock.json ./
# AI-generated
COPY scripts/prisma-generate.mjs ./scripts/prisma-generate.mjs
RUN npm ci

# ---- dev: source is synced in by `docker compose watch` ---------------------
FROM deps AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
CMD ["sh", "-c", "npx prisma generate && npx prisma migrate deploy && exec npm run dev"]

# ---- build: compile TS (tsc), then strip dev dependencies -------------------------
FROM deps AS build
COPY . .
# prisma.config.ts requires DATABASE_URL to be set, but generate never connects.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate \
 && npm run build \
 && npm prune --omit=dev

# ---- production -------------------------------------------------------------
FROM base AS production
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts ./
# Trusted through NODE_EXTRA_CA_CERTS, set in the ECS task definition. 644 so USER node can read it.
# Keep it directly in /etc/ssl: --chmod also applies to any parent directory ADD creates, and a
# 644 directory cannot be entered by USER node.
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/ap-southeast-1/ap-southeast-1-bundle.pem /etc/ssl/rds-ap-southeast-1-bundle.pem
USER node
EXPOSE 3000
# Apply pending migrations, then hand PID over to node so it receives SIGTERM.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/server.js"]
