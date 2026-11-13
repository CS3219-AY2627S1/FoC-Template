FROM node:24-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build --workspace=@relay/credit-frontend

FROM nginx:alpine
COPY --from=build /app/credit-service/frontend/dist /usr/share/nginx/html
COPY credit-service/frontend/nginx.conf /etc/nginx/conf.d/default.conf
