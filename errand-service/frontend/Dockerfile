FROM node:24-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build --workspace=@relay/errand-frontend

FROM nginx:alpine
COPY --from=build /app/errand-service/frontend/dist /usr/share/nginx/html
COPY errand-service/frontend/nginx.conf /etc/nginx/conf.d/default.conf
