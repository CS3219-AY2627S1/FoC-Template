<!-- AI Assistance Disclosure: ChatGPT (Codex, GPT-6), 2026-11-12. Scope: Chat bug fix record. Human review pending. -->

# Chat bug fixes

- Tool/model: ChatGPT (Codex, GPT-6), 2026-11-12, Asia/Singapore.
- Mode: debugging, implementation against existing service contracts, regression
  testing, documentation. Human review pending.

## Exact user prompt

> Currently on another branch to work on some bug fixes for my teammate. Feedback provided and bug fix required for:
> Upon the courier closing the chat, any last messages during the time will push the last message up
>
> and chat service stays open for 1 hour after requestor but courier cannot access chat service through UI afterwards.
>
> Thus, ensure that any last messages do not get pushed out of order on the UI and that the courier is able to access the UI afterwards for the stipulated 1 hour

## Key responses and implementation

The UI previously appended send acknowledgements and socket messages in arrival
order. Rejoins replaced message history outright. Messages are now merged by ID,
sorted by server sentAt and numeric ID for ties, with existing read receipts
retained. Late responses from obsolete joins, a previous order/status, or a
closed/unmounted chat are discarded.

The existing backend already permits chat for one hour after delivery or
cancellation. My Orders retains completed courier deliveries. Added a Return to
chat completion action and explicit View Details & Chat card text. Chat service
remains authoritative for the window and participant access.

Affected files:
- ui/api/chat.ts
- ui/hooks/useChat.ts
- ui/App.tsx
- ui/components/RequestCard.tsx
- ui/tests/chatMessages.test.cjs
- README.md
- This record.

Backend code, schema, socket protocol and dependency manifests are unchanged.
## Verification

- All 27 UI tests passed, including five new chat regression cases.
- TypeScript and production build passed using Node 22.22.0.
- git diff --check passed.
- Tested out-of-order event/ack merges, late history, retained receipts, numeric ID
  ties, completed-order chat entry text, and the existing backend window just before
  and exactly at one hour after delivery/cancellation.
- Restored this branch's existing declared UI dependencies. Initial sandboxed
  install failed on DNS, and the system npm runtime selected incompatible native
  binaries. Reinstalled with the existing ARM Node 22 runtime; build then passed.
  Dependency manifests and lockfiles remain unchanged.
- Live two-user chat across services was not run. Human review remains pending.
