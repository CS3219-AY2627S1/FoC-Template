FROM python:3.12-slim

RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin appuser

WORKDIR /app

COPY credit-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY packages/foc-observability /tmp/foc-observability
RUN pip install --no-cache-dir /tmp/foc-observability

COPY credit-service/alembic.ini .
COPY credit-service/alembic ./alembic
COPY credit-service/app ./app

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/ready', timeout=3)"

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
