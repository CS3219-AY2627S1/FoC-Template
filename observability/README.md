<!--
AI Assistance Disclosure: OpenAI Codex, 2026-11-10.
Scope: Local logging setup, safe operations and verification instructions for #66.
Author review: Reviewed and approved by @ron on 2026-11-10.
-->

# Local centralised logs

This optional stack collects existing container logs with Alloy, stores them in
Loki, and displays them in Grafana Explore. It is separate from the application
and requires no application logger changes or Grafana Cloud account.

It collects User, Supplier, Order and Credit logs plus frontend **nginx diagnostic
stderr**. Frontend access stdout is discarded. Browser console messages, database
and Kafka infrastructure logs, metrics and distributed traces are not collected.

## Start

Prerequisites: Docker Desktop/Engine with Compose, the normal application setup,
and dummy accounts/data. Run commands below from the repository root.

1. Start the application using its existing instructions, for example
   `docker compose up --build -d`. Check its project name under `NAME`:

   ```sh
   docker compose ls
   cp observability/.env.example observability/.env
   ```

2. Edit `observability/.env`. Set `APP_COMPOSE_PROJECT` to that exact application
   project name and choose a local `GRAFANA_ADMIN_PASSWORD`. Leave the username
   as `admin`, or choose another. The file is gitignored; the example has no password.
   The root application `.env` is a separate file and is not read by this stack.

3. Start logging:

   ```sh
   docker compose --env-file observability/.env -f observability/compose.yaml -p foc-observability up -d --wait
   ```

4. Open <http://localhost:3300>, sign in with the Grafana credentials from the
   logging `.env`, and open **Explore** with the **FoC logs** data source. These
   credentials are independent of FoC's MEMBER/ADMINISTRATOR accounts. If another
   process uses 3300, change `GRAFANA_PORT` and open that port instead.

Only Grafana is published, on `127.0.0.1`; Loki and Alloy have no host ports.
Startup may take several seconds. If the page is not ready, inspect the optional
stack with the same command prefix followed by `ps` or `logs --tail 30`.

## Find a log

Choose a recent time window, such as **Last 15 minutes**, then run a query below.
Replace `foc` with your actual application project name:

```logql
{project="foc", service_name="supplier-service"}
```

Make a Supplier API request in the app or your existing API scripts. Find the
response's `X-Request-Id`, then search it as text:

```logql
{project="foc", service_name="supplier-service"} |= "PASTE-REQUEST-ID-HERE"
```

Supplier completion fields are inside Nest's `message` object; parse explicitly
when you need a field filter:

```logql
{project="foc", service_name="supplier-service"} | json requestId="message.requestId" | requestId="PASTE-REQUEST-ID-HERE"
```

Other useful examples:

```logql
{project="foc", service_name=~"order-service|credit-service"}
{project="foc", service_name="frontend", stream="stderr"}
{project="foc"} |~ "(?i)(error|failed|unavailable)"
```

The last query is a text search, not a reliable count of every failure. Services
have different formats and event coverage. Plain text remains readable; User
does not currently log every HTTP request. Collection does not create missing
events or connect an entire cross-service request automatically.

## Stop, reset and passwords

Stop/remove only logging containers and their network; logs and Grafana state
remain in named volumes:

```sh
docker compose --env-file observability/.env -f observability/compose.yaml -p foc-observability down
```

To intentionally delete **all collected logging data and Grafana state**, use the
same logging command with `down -v`:

```sh
docker compose --env-file observability/.env -f observability/compose.yaml -p foc-observability down -v
```

This explicit file/project targets logging volumes, not the application's database
volumes. Restart with `up -d --wait`. No global Docker prune is needed.

Grafana uses environment credentials only to create its first administrator.
Changing the `.env` password later does not reset an existing account. While
signed in, change it through Grafana's profile settings. If locked out, stop the
logging stack, remove **only** `foc-observability_grafana-data`, and start it again.
That resets Grafana accounts/settings using the new `.env` credentials while
preserving collected Loki logs and Alloy read positions. The volume name assumes
the explicit project name used in every command above.

## Local verification and presentation

From the repository root:

```sh
./observability/smoke.sh
```

The script additionally needs Node.js 22+ and curl. It starts isolated throwaway
logging services and labelled fixtures, using an automatically assigned loopback
port and generated dummy credentials. It does not require your logging `.env` or
start/change your application stack. It tests collection, mixed/nested JSON,
nginx streams and filtering, credential-pattern masking, source/project isolation,
configured retention, restart persistence, authentication and owned cleanup.
Look for its final **PASS** message. It removes its containers and volumes even
after failure; pulled images remain cached.

For a short manual demonstration, use the real application: make a Supplier
request, find its request ID in Explore, switch to Order/Credit, and show their
existing events. Stop logging and show the app still works; restart logging and
find an earlier record. A seven-day deletion test is not implied by this short demo.

## Boundaries and troubleshooting

- Use trusted local containers and dummy data. Backend logs can contain account
  identifiers. The collector masks familiar Bearer credentials and PostgreSQL URL
  patterns; nginx diagnostics have client/request context removed. This is not a
  universal secret scrubber or an anonymity guarantee.
- Docker access is powerful: even a socket bind mounted `:ro` permits broad Docker
  API access. This is the approved trusted-laptop setup, not a production boundary.
  Do not expose the Docker API on a host port. `DOCKER_SOCKET_PATH` is the socket
  path on the Docker daemon host; `/var/run/docker.sock` worked with Docker Desktop
  during verification. Remote/rootless setups may need a different host-side path.
- If logs are absent, check the exact Compose project/service labels, time window,
  socket access and Alloy logs. Running a service directly with npm does not create
  a Docker source. Unrelated projects and migration jobs are intentionally excluded.
- Loki's compactor retains logs for seven days and removes old data asynchronously.
  Named volumes survive container replacement. Retention is not a hard disk quota
  and does not rotate Docker's original container logs. Logging is not an audit store.

See the [approved plan](../docs/plans/local-centralised-logging.md) and the official
[Alloy Docker example](https://grafana.com/docs/alloy/latest/monitor/monitor-docker-containers/),
[Loki retention](https://grafana.com/docs/loki/latest/operations/storage/retention/) and
[Grafana provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/) references.
