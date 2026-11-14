# syntax=docker/dockerfile:1
#
# AI Assistance Disclosure:
# Tool: GitHub Copilot (model: GPT-5.6 Luna), date: 2026-10-16
# Scope: Added the frontend development container used by the root Compose
#        development override. No requirements, architecture, schema, or API
#        decisions were made by the AI tool.
# Author review: tng wen xi
#
# Tool: Claude Code (model: claude-opus-5), date: 2026-11-04
# Scope (2026-11-04): Added the build and prod stages. `vite build` was previously never
#        run in any image and there was no production target, so the frontend could not
#        be deployed. Static output is served by nginx, which also proxies the API paths
#        frontend/vite.config.js proxies in development.
#        No requirements, architecture, schema, or API decisions were made by the AI tool.
# Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]

# Compiles the bundle. Separate from `prod` so the toolchain and node_modules stay out
# of the published image; only dist/ is copied forward.
#
# NODE_ENV is deliberately not set to production here: npm ci already ran in `deps` with
# devDependencies, and vite — the build tool itself — is a devDependency.
FROM deps AS build
COPY . .
RUN npm run build

# nginx serves the static bundle and proxies the API paths, so the browser talks to one
# origin and no VITE_* base URL has to be baked in at build time. Nothing in
# frontend/src reads import.meta.env, so there is nothing to bake.
FROM nginx:1.27-alpine AS prod
COPY nginx/proxy-headers.inc /etc/nginx/conf.d/proxy-headers.inc
COPY nginx/default.conf      /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist  /usr/share/nginx/html
EXPOSE 80
# nginx:alpine's own entrypoint and CMD are inherited (daemon off, logs to stdout).
