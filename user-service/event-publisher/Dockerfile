# AI Assistance Disclosure:
# Tool: ChatGPT (model: GPT-6.1 Terra), date: 2026-11-06
# Scope: Generated dockerfile and added RDS certificate
# Author review: Verified correctness

FROM node:22-alpine
RUN apk add --no-cache wget \
    && wget -qO /etc/ssl/certs/rds-global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
    && cat /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/rds-global-bundle.pem > /etc/ssl/certs/relay-ca-bundle.pem
ENV SSL_CERT_FILE=/etc/ssl/certs/relay-ca-bundle.pem
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/user-auth-backend-middleware/package.json ./packages/user-auth-backend-middleware/
COPY packages/user-prisma/package.json ./packages/user-prisma/
COPY user-service/backend/package.json ./user-service/backend/
RUN npm ci
COPY packages/contracts ./packages/contracts
COPY packages/user-prisma ./packages/user-prisma
COPY user-service/backend ./user-service/backend
COPY user-service/event-publisher ./user-service/event-publisher
RUN npx prisma generate --schema=user-service/backend/prisma/schema.prisma
CMD ["npx", "tsx", "user-service/event-publisher/main.ts"]
