FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:stable-alpine
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=755 check-env.sh /docker-entrypoint.d/19-check-env.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
