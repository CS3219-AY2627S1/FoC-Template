# AWS packaging only. The team's api-gateway files remain unchanged.
FROM nginx:1.31-alpine
COPY api-gateway/nginx.conf /etc/nginx/nginx.conf
COPY api-gateway/entrypoint.sh /entrypoint.sh
COPY scripts/aws/gateway/public-entry.conf /etc/nginx/public-entry.conf
COPY scripts/aws/gateway/start.sh /aws-start.sh
RUN sed -i 's/\r$//' /entrypoint.sh /aws-start.sh \
    && chmod +x /entrypoint.sh /aws-start.sh \
    && sed -i 's/listen 80;/listen 127.0.0.1:8082;/' /etc/nginx/nginx.conf \
    && sed -i '/http {/a\    include /etc/nginx/public-entry.conf;' /etc/nginx/nginx.conf
ENTRYPOINT ["/aws-start.sh"]
CMD ["nginx", "-g", "daemon off;"]
