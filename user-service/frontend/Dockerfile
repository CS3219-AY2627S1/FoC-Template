FROM node:24-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build --workspace=@relay/user-frontend

FROM nginx:alpine
COPY --from=build /app/user-service/frontend/dist /usr/share/nginx/html
COPY user-service/frontend/nginx.conf /etc/nginx/conf.d/default.conf
