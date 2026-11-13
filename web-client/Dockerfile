# Stage 1 builds the static files. Node and node_modules stay behind in this stage.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2 only serves the built files. The unprivileged image runs nginx as a non-root user on 8080.
FROM nginxinc/nginx-unprivileged:1.30-alpine
# Read the DNS server from the container's resolv.conf, and fill in only our own variables
# (*_SERVICE_URL, DEV_MAILBOX_URL and the resolver), so nginx's own $uri etc. stay intact.
# DEV_MAILBOX_URL defaults to empty, so the template always resolves and no test inbox is shown.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    NGINX_ENVSUBST_FILTER=_SERVICE_URL|NGINX_LOCAL_RESOLVERS|DEV_MAILBOX_URL \
    DEV_MAILBOX_URL=""
COPY nginx/templates/ /etc/nginx/templates/
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080