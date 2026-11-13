# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-16
# Scope: Generated the credit backend container build and startup configuration.
# Author review: Verified and ran docker build and did end-to-end testing.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/user-auth-backend-middleware/package.json ./packages/user-auth-backend-middleware/
COPY packages/credit-prisma/package.json ./packages/credit-prisma/
COPY credit-service/backend/package.json ./credit-service/backend/
RUN npm ci
COPY packages/contracts ./packages/contracts
COPY packages/user-auth-backend-middleware ./packages/user-auth-backend-middleware
COPY packages/credit-prisma ./packages/credit-prisma
COPY credit-service/backend ./credit-service/backend
RUN npx prisma generate --schema=credit-service/backend/prisma/schema.prisma
RUN npm run build --workspace @relay/user-auth-backend-middleware
RUN npm run build --workspace @relay/credit-backend

FROM node:22-alpine AS runtime
RUN apk add --no-cache wget \
    && wget -qO /etc/ssl/certs/rds-global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
    && cat /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/rds-global-bundle.pem > /etc/ssl/certs/relay-ca-bundle.pem
ENV SSL_CERT_FILE=/etc/ssl/certs/relay-ca-bundle.pem
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/contracts ./packages/contracts
COPY --from=build /app/packages/user-auth-backend-middleware ./packages/user-auth-backend-middleware
COPY --from=build /app/packages/credit-prisma ./packages/credit-prisma
COPY --from=build /app/credit-service/backend/package.json ./credit-service/backend/
COPY --from=build /app/credit-service/backend/dist ./credit-service/backend/dist


COPY --from=build /app/credit-service/backend/prisma ./credit-service/backend/prisma
COPY deploy/scripts/kafka-topics.mjs ./scripts/kafka-topics.mjs
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy --schema=credit-service/backend/prisma/schema.prisma && npx tsx credit-service/backend/dist/server.js"]
