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
RUN PRISMA_SKIP_POSTINSTALL_GENERATE=true npm ci -w user-service -w @foc/messaging

COPY shared/messaging ./shared/messaging
COPY user-service ./user-service

WORKDIR /repo/user-service
RUN npm run build

# --- Migrate stage (one-off job) ---
# Reuses the build stage, which has the pinned Prisma CLI (a devDependency)
# plus the schema and migrations.
FROM build AS migrate
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# --- Runtime stage ---
FROM base AS runtime
ENV NODE_ENV=production
RUN PRISMA_SKIP_POSTINSTALL_GENERATE=true npm ci --omit=dev -w user-service -w @foc/messaging

# Compiled code from the build stage.
COPY --from=build /repo/shared/messaging/dist ./shared/messaging/dist
COPY --from=build /repo/user-service/dist ./user-service/dist

# Prisma's generated engine/client artifacts.
COPY --from=build /repo/node_modules/.prisma ./node_modules/.prisma

# Prisma schema/migrations and gRPC proto files.
COPY user-service/prisma ./user-service/prisma
COPY user-service/proto ./user-service/proto

WORKDIR /repo/user-service

# The messaging logger writes to ./logs at startup. Give the non-root user
# that one folder; everything else stays read-only to it.
RUN mkdir -p logs && chown node:node logs

EXPOSE 3001 50051
USER node
CMD ["node", "dist/index.js"]
