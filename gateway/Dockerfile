# syntax=docker/dockerfile:1
# AI Assistance Disclosure:
# Tool: OpenAI Codex (GPT-5), date: 2026-10-13
# Mode: Implementation and configuration.
# Scope: Added the Reporting Service upstream default to the gateway image.
# Author review: I reviewed for correctness.

FROM nginx:1.29-alpine

# Upstream defaults match the service names in compose.yaml. Cloud Run deployments
# override them with the services' HTTPS URLs (see gateway/deploy/env.yaml).
ENV PORT=8080 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    FRONTEND_URL=http://frontend:8080 \
    USER_SERVICE_URL=http://user-service:8080 \
    SUPPLIER_SERVICE_URL=http://supplier-service:8080 \
    ORDER_SERVICE_URL=http://order-service:8080 \
    CREDIT_SERVICE_URL=http://credit-service:8080 \
    REPORTING_SERVICE_URL=http://reporting-service:8080 \
    ADMIN_SERVICE_URL=http://admin-service:8080

RUN rm /etc/nginx/conf.d/default.conf
COPY snippets/ /etc/nginx/snippets/
COPY templates/ /etc/nginx/templates/

EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/gateway/health" >/dev/null || exit 1
