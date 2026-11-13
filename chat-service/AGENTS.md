# Chat Service

Owner: Eldridge. Read [blueprint](README.md) and linked Chat/Admin contract for the affected work.
The runnable core implements preferences, localized quick replies, JWT security, Order lifecycle
projection, private message history, assignment-epoch privacy, images, WebSockets and RabbitMQ
fan-out. Amazon Translate/S3 adapters and Admin case conversations remain later work.

Own conversations, participant permissions, ordered messages, private images, translation and
durable activity timeline. Keep original messages, isolate private case conversations, enforce
terminal/read-only state and deduplicate sends/events. Authorization applies equally to REST,
WebSocket and image access. Never mutate Credit, User or Order data or infer their outcomes.

The approved historical-courier rule segments messages by assignment epoch. Do not silently change
shared event/API schemas.
Keep Chat and Credit databases independent despite the common developer owner.

Use root `$foc-iterate-feature` stages. Update tests/README and add CI when code exists. Shared
gateway/Compose/broker/env/CI changes require a nominated editor and affected-owner review.
