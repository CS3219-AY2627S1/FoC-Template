# AI Assistance Disclosure:
# Tool: Codex (ChatGPT-5.6 Sol)
# Date: 2026-09-21
# Scope: Generated and fixed the Supplier backend container build.
# Author review: Reviewed the output and adjusted configuration and integration details to fit project
# requirements.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/user-auth-backend-middleware/package.json ./packages/user-auth-backend-middleware/
COPY supplier-service/backend/package.json ./supplier-service/backend/
RUN npm ci
COPY packages/contracts ./packages/contracts
COPY packages/user-auth-backend-middleware ./packages/user-auth-backend-middleware
COPY supplier-service/backend ./supplier-service/backend
RUN npm run build --workspace=@relay/user-auth-backend-middleware
RUN npm run build --workspace=@relay/supplier-backend
FROM node:22-alpine
RUN apk add --no-cache wget \
    && wget -qO /etc/ssl/certs/rds-global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
WORKDIR /app
COPY --from=build /app/supplier-service/backend/dist ./dist
COPY --from=build /app/supplier-service/backend/package.json ./package.json
COPY supplier-service/backend/src/schema.sql ./schema.sql
COPY supplier-service/backend/migrate.js ./migrate.js
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/contracts ./packages/contracts
COPY --from=build /app/packages/user-auth-backend-middleware ./packages/user-auth-backend-middleware
EXPOSE 3000
CMD ["npx", "tsx", "dist/app.js"]
