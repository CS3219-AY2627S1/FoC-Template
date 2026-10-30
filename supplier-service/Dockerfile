# Must be built from the project root so shared/ is available.

# --- Base ---
FROM node:22-slim AS base
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
RUN npm ci -w supplier-service -w @foc/grpc -w @foc/messaging

COPY shared/grpc ./shared/grpc
COPY shared/messaging ./shared/messaging
COPY supplier-service ./supplier-service

WORKDIR /repo/supplier-service
RUN npm run build

# --- Migrate stage (one-off job) ---
# Reuses the build stage, which has the pinned Supabase CLI (a devDependency)
# plus supabase/migrations and the seed.
FROM build AS migrate

# The CLI writes to supabase/.temp, so the node user needs that folder.
RUN chown -R node:node supabase

USER node
CMD ["sh", "-c", "npx supabase db push --db-url \"$DATABASE_URL\" --include-seed --yes"]

# --- Runtime stage ---
FROM base AS runtime
ENV NODE_ENV=production
RUN npm ci --omit=dev -w supplier-service -w @foc/grpc -w @foc/messaging

# Compiled code from the build stage.
COPY --from=build /repo/shared/grpc/dist ./shared/grpc/dist
COPY --from=build /repo/shared/messaging/dist ./shared/messaging/dist
COPY --from=build /repo/supplier-service/dist ./supplier-service/dist

# shared/grpc loads these proto files at runtime by relative path.
COPY shared/grpc/proto ./shared/grpc/proto
COPY user-service/proto ./user-service/proto

WORKDIR /repo/supplier-service

# The messaging logger writes to ./logs at startup. Give the non-root user
# that one folder; everything else stays read-only to it.
RUN mkdir -p logs && chown node:node logs

EXPOSE 3002 50052
USER node
CMD ["node", "dist/main.js"]
