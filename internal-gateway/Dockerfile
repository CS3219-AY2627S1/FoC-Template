FROM nginx:stable-alpine

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=755 check-env.sh /docker-entrypoint.d/19-check-env.sh

EXPOSE 80
