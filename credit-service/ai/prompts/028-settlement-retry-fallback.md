<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), date: 2026-10-21 (Asia/Singapore).
Scope: Archived the exact human-defined settlement fallback change and implementation results.
-->

# Prompt archive — 028

## Exact user prompt

```text
for settle: we need to make same-courier settle behave the same way as release and return the current reservation

so this in CreditService.ts needs to be replaced

if (reservation.status !== 'RESERVED') {
        throw new CreditOperationError('FAILED_PRECONDITION', 'Reservation is not active', 'INVALID_STATE');
      }

settled with the same courier as the request: return the current reservation, built the same way the release branch builds it, make no writes
settled with a different courier: throw the conflict error with reason REQUEST_CONFLICT.
released: invalid state
reserved: continue as now

we can also add the tests
```

## Key assistant response (verbatim)

I’ll update settlement so that, when there’s no saved retry result, a settled reservation returns its current state for the same courier and `REQUEST_CONFLICT` for a different courier. I’ll add tests to verify both paths leave the database unchanged and preserve the released-state rejection.

## Key output

Added the SETTLED branch before the active-state check in CreditService.settleCredits.
Matching courier returns `{ reservation, changed: false }`, using the same return
shape as the existing release fallback. Different courier throws the existing
CreditOperationError with FAILED_PRECONDITION and REQUEST_CONFLICT. RELEASED still
fails with INVALID_STATE; RESERVED runs the existing transfer. Saved-result/hash
checks still occur first in mutateReservation. No schema, proto or retry-client
changes were needed.

Two PostgreSQL regression tests remove only the transfer retry record in an
isolated test schema after a successful settlement. Concurrent same-courier
retries return the current full reservation without any changes across accounts,
reservations, history or retry records. The transfer record remains absent.
Different-courier requests fail with REQUEST_CONFLICT and unchanged table
snapshots, including when that ID has no account or equals the requester.
Existing tests cover saved-result replay/conflict, released-state rejection and
normal active settlement. Both new cases were observed failing before the fix.

## Verification

Full workspace build, all 77 credit checks against PostgreSQL/local listeners,
and all 51 shared checks passed, zero failures/skips. Tests use isolated schemas
and remove them afterward. Diff whitespace checked.
No external source, copied third-party implementation, dependency, skill,
delegation, commit, push or deployment. Human review remains pending.
