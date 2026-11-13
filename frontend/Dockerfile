# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
ARG VITE_CARTO_API_KEY
RUN npm run build

FROM nginx:1.28-alpine AS runtime
RUN apk add --no-cache curl openssl \
    && rm -rf /usr/share/nginx/html/*

ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    FOC_USER_UPSTREAM="user-service:8080 resolve" \
    FOC_SUPPLIER_UPSTREAM="supplier-service:8081 resolve" \
    FOC_ORDER_UPSTREAM="order-service:8082 resolve" \
    FOC_CREDIT_UPSTREAM="credit-service:8083 resolve" \
    FOC_REALTIME_UPSTREAM="realtime-service:8084 resolve"

COPY --from=build /app/dist/ /usr/share/nginx/html/
COPY infra/docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY infra/docker/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY infra/docker/nginx/cache-headers.conf /etc/nginx/snippets/cache-headers.conf
COPY infra/docker/nginx/nocache-headers.conf /etc/nginx/snippets/nocache-headers.conf
COPY infra/docker/nginx/entrypoint.sh /entrypoint.sh
COPY infra/docker/nginx/generate-certs.sh /generate-certs.sh

EXPOSE 80 443
ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
