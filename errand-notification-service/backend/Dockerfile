# AI Assistance Disclosure:
# Tool: Codex (ChatGPT-5.6 Sol)
# Date: 2026-11-02
# Scope: Generated the notification service container build.
# Author review: Reviewed the output and adjusted configuration to fit project requirements.

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/user-auth-backend-middleware/package.json ./packages/user-auth-backend-middleware/
COPY errand-notification-service/backend/package.json ./errand-notification-service/backend/

RUN npm ci

COPY packages/contracts ./packages/contracts
COPY packages/user-auth-backend-middleware ./packages/user-auth-backend-middleware
COPY errand-notification-service/backend ./errand-notification-service/backend

RUN npm run build --workspace @relay/user-auth-backend-middleware
RUN npm run build --workspace @relay/errand-notification-backend

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/contracts ./packages/contracts
COPY --from=build /app/packages/user-auth-backend-middleware ./packages/user-auth-backend-middleware
COPY --from=build /app/errand-notification-service/backend/package.json ./errand-notification-service/backend/
COPY --from=build /app/errand-notification-service/backend/dist ./errand-notification-service/backend/dist
COPY --from=build /app/errand-notification-service/backend/src ./errand-notification-service/backend/src

EXPOSE 3010

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3010/health || exit 1

CMD ["sh", "-c", "npx tsx errand-notification-service/backend/src/server.ts"]
