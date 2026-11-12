FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini .
COPY alembic ./alembic
COPY main ./main

CMD ["sh", "-c", "alembic upgrade head && exec uvicorn main.app:app --host 0.0.0.0 --port 8000"]
