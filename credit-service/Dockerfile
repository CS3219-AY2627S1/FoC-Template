# AI Assistance Disclosure: Claude Code (Claude Opus 5.5), 2026-10-16. Scope: image built the
# same way as user-service/Dockerfile (two stages, fresh production install, allowlisted
# runtime contents, non-root user, pinned base image). Author review: Reviewed and approved by @phuc
# Additional AI assistance: Claude Code (Claude Opus 5.5), 2026-10-16. Scope: runs the service
# entry point; added the e2e test stage. Author review: Reviewed and approved by @phuc
# Additional AI assistance: OpenAI Codex, 2026-11-09, for issue #62.
# Scope: compile the locked Kafka addon with Alpine libraries; copy pruned
# production dependencies into the matching runtime. Author review: Reviewed and approved by @ron on 2026-11-09.

# ---- Dependencies: compile the bundled librdkafka instead of fetching a binary --
FROM node:22.23.3-alpine3.24 AS dependencies
WORKDIR /app
RUN apk add --no-cache bash python3 make g++ pkgconf \
    openssl-dev zlib-dev zstd-dev cyrus-sasl-dev curl-dev lz4-dev

# Dependencies first, so this layer is cached until package*.json changes
COPY package*.json ./
# Upstream uses unbounded make -j; cap it for concurrent Compose/CI builds.
RUN npm ci --ignore-scripts \
    && sed -i 's/"make", "-j",/"make", "-j2",/' \
       node_modules/@confluentinc/kafka-javascript/deps/librdkafka.gyp \
    && CKJS_LINKING=dynamic npm_config_build_from_source=true \
       npm_config_nodedir=/usr/local npm rebuild --foreground-scripts

# ---- Build stage: all packages + TypeScript compiler -> dist/ -------------------
FROM dependencies AS build
COPY . .
RUN npm run build

# ---- End-to-end test runner (credit-service/e2e/run.sh builds this target) ----------
# Has the dev packages (tsx) and the e2e tests; never deployed.
FROM build AS e2e
USER node
CMD ["node", "--import", "tsx", "--test", "--test-reporter=spec", "--test-concurrency=1", "e2e/credit-flow.test.ts"]

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --ignore-scripts

# ---- Runtime stage: only what the service and the migration step run ------------
FROM node:22.23.3-alpine3.24 AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache cyrus-sasl libcurl lz4-libs zstd-libs

COPY package*.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules

# Allowlist: compiled code and the SQL migrations, nothing else
COPY --from=build /app/dist ./dist
COPY migrations ./migrations

# The base image's unprivileged user (uid 1000); the app only reads its files
USER node

# The migration step overrides this with: node dist/migrate.js
CMD ["node", "dist/index.js"]
