# AI-assisted (Claude), reviewed and tested by Maliha
# Steps to build the UI in a Docker image

# --- Build stage: compile the React app into static files ---
FROM node:22-slim AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Runtime stage: nginx serves the files and forwards /backend/* to the services ---
FROM nginx:1.27-alpine AS runtime

# nginx fills in the ${...} values from these when the container starts,
# so the same image works with services anywhere (override in compose)
ENV USER_SERVICE_URL=http://host.docker.internal:3001 \
    SUPPLIER_SERVICE_URL=http://host.docker.internal:3002 \
    ORDER_SERVICE_URL=http://host.docker.internal:3003 \
    CREDIT_SERVICE_URL=http://host.docker.internal:3004 \
    DNS_RESOLVER=127.0.0.11

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80