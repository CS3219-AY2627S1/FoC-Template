FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main ./main
COPY test ./test
COPY integration ./integration
CMD ["python", "-m", "pytest", "-q", "-rs", "integration/test_credit_flow.py", "test"]
