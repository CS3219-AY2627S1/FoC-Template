# AI Assistance Disclosure:
# Tool: Codex (ChatGPT-5.6 Sol)
# Date: 2026-10-12
# Scope: Generated and debugged the Errand backend container build.
# Author review: Reviewed the output and adjusted configuration details to fit project
# requirements. 

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/user-auth-backend-middleware/package.json ./packages/user-auth-backend-middleware/
COPY packages/errand-prisma/package.json ./packages/errand-prisma/
COPY errand-service/backend/package.json ./errand-service/backend/

RUN npm ci

COPY packages/contracts ./packages/contracts
COPY packages/user-auth-backend-middleware ./packages/user-auth-backend-middleware
COPY packages/errand-prisma ./packages/errand-prisma
COPY errand-service/backend ./errand-service/backend

RUN npx prisma generate --schema=errand-service/backend/prisma/schema.prisma
RUN npm run build --workspace @relay/user-auth-backend-middleware
RUN npm run build --workspace @relay/errand-backend

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
COPY --from=build /app/packages/errand-prisma ./packages/errand-prisma
COPY --from=build /app/errand-service/backend/package.json ./errand-service/backend/
COPY --from=build /app/errand-service/backend/dist ./errand-service/backend/dist
COPY --from=build /app/errand-service/backend/src ./errand-service/backend/src
COPY --from=build /app/errand-service/backend/prisma ./errand-service/backend/prisma

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy --schema=errand-service/backend/prisma/schema.prisma && npx tsx errand-service/backend/src/app.ts"]
