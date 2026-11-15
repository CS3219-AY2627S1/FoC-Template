# AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25. Scope: containerized Supplier build and runtime seed/application startup after the separate migration job. Author review: Reviewed and approved by @ron.
# Additional AI assistance: OpenAI Codex (GPT-6), 2026-09-25. Scope: copied bundled Supplier image assets into the issue #17 runtime image. Author review of additional changes: Reviewed and approved by @ron.
FROM node:22-alpine AS build

WORKDIR /app

COPY supplier-service/package.json supplier-service/package-lock.json ./
RUN npm ci

COPY supplier-service/ ./
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY supplier-service/package.json supplier-service/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY data/csv /data/csv
COPY data/images /data/images

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"]

CMD ["sh", "-c", "node dist/database/seed/run.js && exec node dist/main.js"]
