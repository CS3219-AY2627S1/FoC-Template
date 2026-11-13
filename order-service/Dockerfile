# ChatGPT (Codex), 2026-11-07: Preserve main Docker layout and Order messaging build/runtime wiring; review pending; see usage-log.md.
# AI Assistance Disclosure: ChatGPT (Codex), 2026-10-21.
# Scope: Generated Order Docker build; team review pending; see usage-log.md.
# Must be built from the project root so shared/ is available.

# --- Base ---
FROM node:22-slim AS base
# OpenSSL is needed by Prisma's engine.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

# npm ci needs every workspace's package.json listed in the root package.json,
# even ones this image doesn't use.
COPY package.json package-lock.json .npmrc ./
COPY shared/grpc/package.json ./shared/grpc/
COPY shared/messaging/package.json ./shared/messaging/
COPY order-service/grpc/package.json ./order-service/grpc/
COPY credit-service/package.json ./credit-service/
COPY supplier-service/package.json ./supplier-service/
COPY user-service/package.json ./user-service/

# --- Build stage ---
FROM base AS build
RUN PRISMA_SKIP_POSTINSTALL_GENERATE=true npm ci -w @foc/order-grpc -w @foc/grpc -w @foc/messaging

COPY shared/grpc ./shared/grpc
COPY shared/messaging ./shared/messaging
COPY order-service/grpc ./order-service/grpc
COPY order-service/prisma ./order-service/prisma

# build generates the Prisma client and copies it into dist/generated/prisma.
RUN npm run build -w @foc/grpc && npm run build -w @foc/order-grpc

# --- Migrate stage (one-off job) ---
# Reuses the build stage, which has the pinned Prisma CLI (a devDependency)
# plus the schema and migrations.
FROM build AS migrate
WORKDIR /repo/order-service/grpc
USER node
CMD ["npm", "run", "prisma:deploy"]

# --- Runtime stage ---
FROM base AS runtime
ENV NODE_ENV=production
RUN PRISMA_SKIP_POSTINSTALL_GENERATE=true npm ci --omit=dev -w @foc/order-grpc -w @foc/grpc -w @foc/messaging

# Compiled code (including the generated Prisma client) from the build stage.
COPY --from=build /repo/shared/grpc/dist ./shared/grpc/dist
COPY --from=build /repo/shared/messaging/dist ./shared/messaging/dist
COPY --from=build /repo/order-service/grpc/dist ./order-service/grpc/dist

# shared/grpc and order's credit client load these proto files at runtime by relative path.
COPY shared/grpc/proto ./shared/grpc/proto
COPY user-service/proto ./user-service/proto

WORKDIR /repo/order-service/grpc
RUN mkdir -p logs/rabbitmq && chown -R node:node logs

EXPOSE 3003 50053
USER node
CMD ["node", "dist/index.js"]
