# CHANGE-089: Windows PowerShell Compose stderr compatibility

- Date / developer / branch: 2026-10-09 / Vincent / sprint-2-3-credit.
- Status: focused script fix verified; live connector/financial gates remain `[~]`.
- Scope/authority: continuation of approved local-live implementation CHANGE-088 /
  ADR-029; NFR3.1.3 positive/negative verification and approved technical invariant
  of accurate transport/setup failure reporting. User supplied Setup failure.
- Classification: implementation detail; no business, contract, topology, IAM,
  service ownership, authentication, database or frontend change/new deviation.
- Atomic fix/test commit: `003fd25`; workflow/docs and disclosure separate.

## Root cause and minimal change

Docker Compose writes ordinary progress such as `Network ... Creating` to stderr.
In Windows PowerShell 5.1, redirected native stderr becomes NativeCommandError
records. Invoke-Compose inherited ErrorActionPreference=Stop, so it terminated
before checking Docker's exit status, even though progress alone is not failure.

Invoke-Compose now sets Continue only around the native call, captures stdout
privately and stderr separately, captures LASTEXITCODE immediately, and restores
the caller preference in finally. Nonzero exits still throw with the actual code;
launch exceptions propagate. Neither stdout/config secrets nor stderr are printed.
This matches the existing guarded native handling in Invoke-Cloud/tunnel logs.
No global relaxation, 2>&1 contamination of JSON, fake success or ignored exit.

## Test-first evidence

`Test-LocalLiveNativeOutput.ps1` invokes an actual native Windows `.cmd` fixture,
substituting executable selection only (no Docker or cloud calls). Before the
fix it failed with `NativeCommandError: Network fixture_default Creating` (exit 1).
After the fix all **11** assertions pass: harmless stderr + exit 0, exact stdout
JSON, failure exit 23, private stderr omission, silent failure exit 24, empty
success, Stop/Continue restoration, launch exception propagation/restoration.

Regressions rerun: **60** local-live safety/config assertions and **16** actual
nginx/fixture integration assertions pass. They do not prove real Google push or
financial results. No full Setup rerun/cloud writes/app containers started by this
fix. No image rebuild needed: the host PS1 runs directly from the checkout.
Partial connector/network resources created by the user's previous attempt are
not deleted; idempotent Setup is the next action.

| Project D1 / approved invariant | Implementation | Test | Result |
| --- | --- | --- | --- |
| NFR3.1.3; ADR-029 reliable setup | Invoke-Compose local native handling | Native stderr/exit/preference regression | 11 passed after observed red |
| CHANGE-088 isolated/authenticated connector | Existing config/ingress unchanged | LocalLive / LocalLiveIngress | 60 + 16 passed; live financial gate pending |

Source hashes still match recorded D1/Overall. Generic drift/completion checkers
retain existing manifest/history format failures; not claimed passed. Maven and
frontend suites not rerun: no Java/FE source changed. Whitespace/context syntax
and exact scope checked. AI disclosure updated; learning remains ignored.

## Handoff and recovery

From FoC-P28 rerun the SAME Setup command, then follow the existing runbook build,
up and Check commands. Do not down -v/reset databases or reinstall gcloud for this.
If Docker really exits nonzero, the wrapper fails; inspect the equivalent manual
Compose command privately for diagnostics. Live cloud IAM/OIDC/ledger/browser,
User consumers and paused delegated/background retry work remain separate gates.
Rollback is reverting this isolated wrapper fix; it brings back the Windows bug,
not a database rollback. No migrations, shared/peer changes or push.
