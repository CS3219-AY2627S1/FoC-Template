# AI Assistance Disclosure: Claude Code (Claude Opus 5.5), 2026-09-26. Scope: two-stage build
# of the frontend into an nginx gateway image. Author review: Reviewed and approved by @t-leongchuan

# Stage 1: build the website into plain static files (HTML/CSS/JS) in /app/dist
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: a small nginx image that serves those files and acts as the gateway.
FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
