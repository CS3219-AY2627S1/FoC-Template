# chat-service architecture

<!-- AI-influenced: diagrams drafted with Claude (Opus 5.5); see ../../ai/usage-log.md -->

## Opening a live connection (WebSocket ticket)

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser (SPA)
    participant G as api-gateway
    participant C as chat-service
    participant DB as chat-db

    B->>G: POST /api/chat/ws-ticket<br/>Authorization: Bearer JWT
    G->>G: verify JWT, strip client X-User-*
    G->>C: POST /chat/ws-ticket<br/>X-User-Id: u1
    C->>DB: INSERT ws_tickets(sha256(ticket), u1, now()+30s)
    C-->>B: 201 {ticket, expires_in: 30}
    B->>G: GET /api/chat/ws?ticket=... (Upgrade: websocket)
    G->>G: Origin in CORS_ALLOWED_ORIGINS?
    G->>C: GET /chat/ws?ticket=... (Upgrade)
    C->>DB: DELETE ws_tickets WHERE hash AND not expired RETURNING user_id
    alt ticket valid
        C-->>G: 101 Switching Protocols
        G-->>B: 101 Switching Protocols
        C-->>B: {"type":"ready","data":{"user_id":"u1",...}}
        Note over B,C: frames relayed both ways by the gateway
        C-->>B: close 4002 after CHAT_WS_MAX_SESSION_S
        Note over B: fetch a new ticket (needs a valid JWT), reconnect
    else unknown, used or expired
        C-->>G: 403 (handshake refused)
        G-->>B: 403 (no socket is opened)
    end
```

The ticket is the only credential on the WebSocket URL. It is random (32 bytes), stored
hashed, valid for 30 s and deleted when used, so finding it in a log later is useless.
Cross-site WebSocket hijacking is blocked twice: a page on another site cannot obtain a
ticket (it has no JWT, which lives in the SPA's storage, not in a cookie), and the
gateway refuses handshakes from origins outside `CORS_ALLOWED_ORIGINS`.

## Order chat lifecycle (FoC integration)

```mermaid
stateDiagram-v2
    [*] --> Open: OrderAccepted<br/>create order:{id}, members requester + courier
    Open --> Open: OrderPickedUp / OrderDelivered<br/>system message
    Open --> RequesterOnly: CourierWithdrawn<br/>courier removed
    RequesterOnly --> Open: OrderAccepted (new courier)<br/>added without earlier history
    Open --> Closed: OrderApproved / OrderCancelled<br/>system message, read-only
    RequesterOnly --> Closed: OrderCancelled / OrderExpired
    Closed --> [*]: purge after CHAT_CLOSED_RETENTION_DAYS (if set)
```

The order-service does not call the chat-service and does not know it exists. It
publishes the same facts it already publishes for credit-service and
notification-service, and chat-service consumes them from its own durable queue
(`chat-service.order-events`), with a `processed_events` inbox for idempotency.

## Delivery across replicas

```mermaid
flowchart LR
    subgraph R1["chat-service replica 1"]
      S1["sender's socket"] --> T1["transaction:<br/>INSERT message, outbox row"]
    end
    T1 -->|"after commit"| FX(["foc.chat.fanout<br/>(fanout exchange)"])
    FX --> H1["replica 1 hub"]
    FX --> H2["replica 2 hub"]
    H2 --> S2["recipient's socket"]
    T1 -.->|"outbox relay"| EV(["foc.chat.events<br/>(topic, for other services)"])
```

Socket frames are published only after the transaction commits, so clients never see
rolled-back data. If a fan-out publish is lost, clients recover through `seq` gap
detection and `GET .../messages?after_seq=`.
