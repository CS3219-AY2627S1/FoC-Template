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
- `foc_shared/observability.py` — the one observability implementation:
  per-service Prometheus registry, HTTP metrics labelled by route template,
  error-envelope `code` counters, `/metrics` + `/health/ready` routes,
  `X-Request-Id` propagation, JSON log formatting and broker readiness state.
  A service onboards with:

  ```python
  from foc_shared.observability import Observability

  OBS = Observability("supplier-service", prefix="supplier")
  OBS.install(app, readiness_session_dep=get_session)
  ```

  All seven services are instrumented, including the gateway, which serves its metrics on an internal port (9100).
  `install()` takes these optional arguments:

  - `metrics_route=False` keeps `/metrics` off the app, so it can be served with `serve_metrics(port)` on an internal port instead.
  - `readiness_route=False` leaves `/health/ready` to the service.
  - `metrics_refresh_timeout` (seconds, default 1.0) bounds the gauge refresh that runs before each scrape.

  Metric labels are bounded: the route is the route template or `<unmatched>` (the gateway uses `<other>`), and unknown HTTP methods become `OTHER`.

## Usage

Services install this package separately rather than via `requirements.txt`,
because the path differs between a local venv (`../shared`) and Docker
(`/shared`). Each service's Dockerfile and `make install` handle the install;
the service `requirements.txt` only notes this.
