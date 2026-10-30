# AI Assistance Disclosure:
# Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-21 (Asia/Singapore).
# Scope: Containerized credit gRPC/REST, migration CLI, and human-specified SQL migrations.
# Author review: Pending human review.
# Prompts and key responses: ai/usage-log.md, entries 003, 005–006, 022 and 024.
# AI-generated; human review pending.
# Entry 034: OpenAI Codex (GPT-6), 2026-10-22 (Asia/Singapore).
# Scope: Relocated the human-selected migration runner and updated references while making scripts/docs local-only.
# Changes await human review; prompts/key responses: credit-service/ai/usage-log.md, entry 034 (repository-relative).
# Entry 037: OpenAI Codex (GPT-6), 2026-10-22 Asia/Singapore.
# Scope: Added the human-selected messaging workspace to image build/runtime; review pending.
# Prompts/key responses: ai/usage-log.md, entry 037.

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
RUN npm ci -w @foc/credit-grpc -w @foc/grpc -w @foc/messaging

COPY shared/grpc ./shared/grpc
COPY shared/messaging ./shared/messaging
COPY credit-service/tsconfig.json ./credit-service/
COPY credit-service/src ./credit-service/src

RUN npm run build -w @foc/grpc -w @foc/messaging \
 && npm run build -w @foc/credit-grpc

# --- Runtime stage ---
FROM base AS runtime
ENV NODE_ENV=production
RUN npm ci --omit=dev -w @foc/credit-grpc -w @foc/grpc -w @foc/messaging

# Compiled code from the build stage.
COPY --from=build /repo/shared/grpc/dist ./shared/grpc/dist
COPY --from=build /repo/shared/messaging/dist ./shared/messaging/dist
COPY --from=build /repo/credit-service/dist ./credit-service/dist

# shared/grpc loads these proto files at runtime by relative path.
COPY shared/grpc/proto ./shared/grpc/proto
COPY user-service/proto ./user-service/proto

# SQL migrations, applied by the credit-migrate job.
COPY credit-service/migrations ./credit-service/migrations

WORKDIR /repo/credit-service

# The messaging logger writes to ./logs at startup. Give the non-root user
# that one folder; everything else stays read-only to it.
RUN mkdir -p logs && chown node:node logs

EXPOSE 50054 3004
USER node
CMD ["node", "dist/index.js"]
