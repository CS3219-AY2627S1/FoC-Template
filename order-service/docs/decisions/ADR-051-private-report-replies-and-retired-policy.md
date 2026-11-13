# ADR-051 — Private report replies and retired policy

Date: 2026-10-19. Status: Accepted by Yao Xiang (CHANGE-147).

Return resolution replies only to the report submitter and reviewing admins, using caller-scoped copied responses so filtering does not mutate saved history. Courier retains case/status access without the private reply. The gated local prototype models this; eventual Report Service must authorize verified principals. Production integration remains unavailable.

Retire COURIER_UNRESPONSIVE from both active policy query lists and reject it in new apply/cancel submissions. Keep the deprecated constant and original amount for deserializing previously persisted history and queued events. Removing the constant outright would break JPA enum loads and existing outbox decoding. No historical rewriting, waiver, migration mutation or topic change. Cancellation remains max(stored, selected), with a single frontend selection on its unchanged list contract.
