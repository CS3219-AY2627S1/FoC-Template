FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/user-auth-backend-middleware/package.json ./packages/user-auth-backend-middleware/
COPY packages/user-prisma/package.json ./packages/user-prisma/
COPY user-service/backend/package.json ./user-service/backend/

RUN npm ci

COPY packages/contracts ./packages/contracts
COPY packages/user-auth-backend-middleware ./packages/user-auth-backend-middleware
COPY packages/user-prisma ./packages/user-prisma
COPY user-service/backend ./user-service/backend

RUN npx prisma generate --schema=user-service/backend/prisma/schema.prisma
RUN npm run build --workspace @relay/user-auth-backend-middleware
RUN npm run build --workspace @relay/user-backend

FROM node:22-alpine AS runtime
RUN apk add --no-cache wget \
    && wget -qO /etc/ssl/certs/rds-global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
    && cat /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/rds-global-bundle.pem > /etc/ssl/certs/relay-ca-bundle.pem
ENV SSL_CERT_FILE=/etc/ssl/certs/relay-ca-bundle.pem

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/user-service/backend/node_modules ./user-service/backend/node_modules
COPY --from=build /app/packages/contracts ./packages/contracts
COPY --from=build /app/packages/user-auth-backend-middleware ./packages/user-auth-backend-middleware
COPY --from=build /app/packages/user-prisma ./packages/user-prisma
COPY --from=build /app/user-service/backend/package.json ./user-service/backend/
COPY --from=build /app/user-service/backend/dist ./user-service/backend/dist
COPY --from=build /app/user-service/backend/prisma ./user-service/backend/prisma

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy --schema=user-service/backend/prisma/schema.prisma && npx tsx user-service/backend/dist/server.js"]
