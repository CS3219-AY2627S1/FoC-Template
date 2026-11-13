FROM nginx:1.31-alpine

COPY entrypoint.sh /entrypoint.sh

RUN sed -i -e 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]