# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6.1 Terra), date: 2026-11-06
# Scope: Generated implementation of container image and database trust configuration for TLS
# Author review: Verified correctness.

FROM node:22-alpine
RUN apk add --no-cache wget \
    && wget -qO /etc/ssl/certs/rds-global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
    && cat /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/rds-global-bundle.pem > /etc/ssl/certs/relay-ca-bundle.pem
ENV SSL_CERT_FILE=/etc/ssl/certs/relay-ca-bundle.pem
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/user-auth-backend-middleware/package.json ./packages/user-auth-backend-middleware/
COPY packages/errand-prisma/package.json ./packages/errand-prisma/
COPY errand-service/backend/package.json ./errand-service/backend/
RUN npm ci
COPY packages/contracts ./packages/contracts
COPY packages/errand-prisma ./packages/errand-prisma
COPY errand-service/backend ./errand-service/backend
COPY errand-service/event-publisher ./errand-service/event-publisher
RUN npx prisma generate --schema=errand-service/backend/prisma/schema.prisma
CMD ["npx", "tsx", "errand-service/event-publisher/main.ts"]
