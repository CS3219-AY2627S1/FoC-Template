FROM node:24-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build --workspace=@relay/supplier-frontend

FROM nginx:alpine
COPY --from=build /app/supplier-service/frontend/dist /usr/share/nginx/html
COPY supplier-service/frontend/nginx.conf /etc/nginx/conf.d/default.conf
