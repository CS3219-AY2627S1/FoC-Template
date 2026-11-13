FROM node:24-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci
ARG AWS_ENDPOINT_URL
ARG COGNITO_CLIENT_ID
ARG COGNITO_USER_POOL_ID
RUN npm run build --workspace=@relay/host

FROM nginx:alpine
COPY --from=build /app/host/dist /usr/share/nginx/html
COPY host/config/nginx.conf /etc/nginx/conf.d/default.conf
