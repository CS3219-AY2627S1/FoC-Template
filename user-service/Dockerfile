FROM python:3.12-slim

WORKDIR /app

# Compose bind-mounts the development CA and server certificate below /run/tls.
# Create the parent directory so file mounts are treated as files.
RUN mkdir -p /run/tls

COPY user-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY packages/foc-observability /tmp/foc-observability
RUN pip install --no-cache-dir /tmp/foc-observability

COPY user-service/alembic.ini .
COPY user-service/alembic ./alembic
COPY user-service/app ./app
COPY user-service/scripts ./scripts

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import ssl, urllib.request; context = ssl.create_default_context(cafile='/run/tls/ca.crt'); urllib.request.urlopen('https://localhost:8080/ready', context=context)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--ssl-certfile", "/run/tls/user-service.crt", "--ssl-keyfile", "/run/tls/user-service.key"]
