# shared

Small shared Python library used across FoC backend services. It is **not** a
microservice — it is a library that services import to keep cross-cutting
contracts consistent.

Contents:

- `foc_shared/events.py` — event names + Pydantic schemas for the RabbitMQ
  order-lifecycle workflow (M6). These are the wire contracts between the
  Order Service (publisher) and the Credit / Notification services
  (consumers).
- `foc_shared/auth.py` — the trusted header contract (`X-User-Id`,
  `X-User-Role`) that the API Gateway injects and backend services read.
- `foc_shared/errors.py` — a common error-envelope shape so all services
  return consistent error responses.
- `foc_shared/images.py` — reusable image validation + private S3 storage
  used for delivery proof photos.

## Usage

Services install this package separately rather than via `requirements.txt`,
because the path differs between a local venv (`../shared`) and Docker
(`/shared`). Each service's Dockerfile and `make install` handle the install;
the service `requirements.txt` only notes this.
