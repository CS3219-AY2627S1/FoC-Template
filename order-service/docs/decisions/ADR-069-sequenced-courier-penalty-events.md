# ADR-069 — One penalty topic with per-courier source sequences

Status: Accepted by Yao Xiang, 2026-11-10. Implementation/verification tracked in
[CHANGE-185](../../changes/CHANGE-185-sequenced-penalty-events.md).

Addition and deduction modify the same capped score and are not commutative.
Supersedes separate topics for NEW publications only. Existing v1 history is immutable.
Use one courier-penalty-event topic per environment, version2 event envelopes,
courierId ordering keys, a transactional Order sequence and durable User inbox/cursor.
Order establishes commit order; User enforces application order even if multiple
publishers deliver later positions first. Dedupe remains event-ID based.

Counter/outbox atomicity and rollback-safe numbering are mandatory. Missing positions
block only that courier and require redrive; they cannot be waived or silently skipped.
Legacy backlogs must drain before cutover; retaining old consumers is compatibility,
not continued new publication. Existing penalty, suspension, refund and report policy
are unchanged. Cloud provisioning/deployment is a separate operator action.
