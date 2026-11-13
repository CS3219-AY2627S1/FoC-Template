# Timestamp: 2026-11-02

# Key Prompt:

The Errand Notification Kafka-to-SSE implementation is complete. Using the existing implementation as the source of truth, help me draft tests for the author-defined event mapping, recipient filtering, SSE subscription flow, timeout, failure threshold, and cleanup behaviour. Do not change the implementation or create new notification rules.

Draft tests for the following event processing behaviour:

- Verify that status changed, completed, cancelled, expired, and deleted Errand events map to the correct SSE notification type.
- Verify that the notification contains the original event id, Errand id, timestamp, previous status, and new status.
- Test a single recipient, multiple recipients, multiple events in sequence, and multiple Errands for the same user.
- Verify that the actor is excluded from the recipients. Include no actor, actor not in the recipient array, and actor as the only recipient.
- Skip events where recipients are missing or empty, or where previous status or new status is missing.
- Test duplicate event ids, long event and Errand ids, rapid events, and the existing `ErrandCreated` behaviour.
- Verify the exact SSE output format is `data: <json>\n\n` and that it matches the shared notification contract.

# Key Prompt 2:

The event processing tests are completed. Now draft tests for the `ErrandNotificationEventStream`.

- Test one subscription, multiple users, and multiple subscriptions for the same user.
- Verify that each subscription receives a unique id and that removing one subscription does not remove the other connections.
- Verify that publishing only sends to the selected users and sends to all active connections for each selected user.
- Test successful writes, resetting the failure count after success, a write timeout after 5 seconds, and removing a subscription after 3 consecutive failures.
- Verify that empty user entries are cleaned up.
- Verify that `closeAll` ends active responses and clears all subscriptions.
- Verify subscriber counts and statistics when users have one or multiple subscriptions.

TEST SETUP AND EXCLUSIONS

- Use Vitest with mocked `ServerResponse` objects and spies for logging and timers where needed.
- Do not require a live Kafka broker, HTTP server, or browser `EventSource`.
- Do not change production code, add persistence, or add unsupported event mappings to make the generated tests pass.

# Usage Scenario:

Generated and debugged tests for the author-defined Errand event validation and mapping, actor exclusion, recipient handling, SSE publication, timeout, failure, and cleanup behaviour.
