# Timestamp: 2026-11-02

# Key Prompt:

I have already defined the Errand Notification service boundary, Kafka consumption flow, event mapping, recipient rules, SSE subscription behaviour, failure thresholds, and shutdown lifecycle. Help me scaffold and draft the implementation without changing those decisions.

SERVICE AND KAFKA FLOW

- Create an Express service with `/health`, Kafka-aware `/healthz`, and an authenticated SSE endpoint at `/api/notifications/stream`.
- Use port 3010 and the Kafka topic `errand-events` by default. `KAFKA_BROKERS` and `COGNITO_USER_POOL_ID` are required.
- Support no Kafka authentication for local development and SCRAM-SHA-512 with TLS when configured. SCRAM mode requires a Kafka username and password.
- Each Notification Service pod must have a unique consumer group id using its hostname or a generated UUID. This is required because each pod has its own in-memory SSE subscribers and must receive every event.
- Disable automatic topic creation. Use a Kafka session timeout of 30 seconds and rebalance timeout of 60 seconds.
- A valid event requires a UUID event id, a supported Errand event type, a valid timestamp, version 1, an object payload, a string Errand id, and a recipient subject array.
- Log and skip a payload that fails the event structure check. Re-throw JSON parsing or event processing failures so Kafka can retry the message.

EVENT MAPPING AND RECIPIENTS

- Map `ErrandCreated` to `ERRAND_CREATED`.
- Map `ErrandStatusChanged`, `ErrandCompleted`, `ErrandCancelled`, and `ErrandExpired` to `ERRAND_STATUS_CHANGED`.
- Map `ErrandDeleted` to `ERRAND_DELETED`.
- Do not create a mapping for an unsupported event type.
- Skip an event if `recipientSubs` is missing or empty.
- If `actorSub` exists, remove it from the recipient list so the actor does not receive a notification for their own action. Skip the event if no recipient remains.
- Require both `previousStatus` and `errandStatus` before sending a notification.
- The SSE notification contains the event id, notification type, Errand id, original timestamp, previous status, and new status. Keep the event id unchanged so the frontend can deduplicate Kafka redelivery.

# Key Prompt 2:

You are now implementing the in-memory SSE subscription and publication behaviour.

- Authenticate the user and subscribe using their Cognito subject. Return 401 if no authenticated user is present.
- Set `Content-Type: text/event-stream`, disable caching and proxy buffering, and write `: connected` when the stream opens.
- Send `: keepalive` every 15 seconds and clear the heartbeat when the connection closes.
- Support multiple users and multiple browser connections for the same user. Generate a separate subscription id for each connection.
- When one connection closes, remove only that subscription. Remove the user's map only when there are no subscriptions left.
- Publish `data: <json>\n\n` to every active subscription for the selected recipient subjects.
- Each write has a timeout of 5 seconds. Track consecutive failures for each subscription, reset it after a successful write, and remove the subscription after 3 consecutive failures.
- Provide subscriber count and statistics for monitoring. Do not add persistence or guaranteed delivery for disconnected users.

# Key Prompt 3:

You are now implementing the Notification Service startup, shutdown, and Docker build.

- Start the HTTP server and Kafka consumer using the existing environment configuration.
- On SIGTERM or SIGINT, ensure shutdown is only performed once.
- Stop accepting new HTTP requests, end all active SSE responses, stop the Kafka consumer, then exit.
- Use a 30-second timeout before forcing the process to exit if graceful shutdown does not complete.
- Scaffold the environment parser, Kafka consumer, Express application, event processing, SSE stream, server lifecycle, and Docker build. Refer to the existing Errand Service setup where relevant.
- Do not change the event contracts, recipient rules, timeout values, authentication, consumer group behaviour, or service boundary.

# Usage Scenario:

Scaffolded and drafted the author-designed Errand Notification Kafka-to-SSE flow, subscription failure handling, cleanup, startup, and shutdown behaviour, then assisted with container and integration debugging.
