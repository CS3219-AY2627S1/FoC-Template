<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), date: 2026-10-22 (Asia/Singapore).
Scope: Archived the human-decided Credit plaintext-only transport request and key results.
-->

# Prompt archive — 035

## Exact user prompt

```text
order and i have decided to remove TLS, so credit should now only run plaintext grpc, can we make the changes?
```

## Key responses

> I’ll make Credit’s gRPC server plaintext-only and update its configuration, tests and README. I’ll also check for shared Credit client code that needs aligning.

> Credit now explicitly starts gRPC in plaintext, and I’ve removed the TLS helper and transport settings. The shared Credit client already defaults to plaintext, so its retry code needs no change. The full build is currently blocked by the ongoing event-consumer work: `@foc/messaging` is missing from this checkout. I’m checking the affected startup and API code separately.

## Outputs

- Startup uses ServerCredentials.createInsecure explicitly; deleted src/grpc/tls.ts.
- Removed CREDIT_LOCAL_MODE/CREDIT_TLS_CERT_PATH/CREDIT_TLS_KEY_PATH from env
  validation, Compose and example env files. Personal env files were not read or
  changed; obsolete process values are ignored by the current configuration.
- Order service-token authorization and REST RS256 JWT/public-key verification
  remain. Shared client plaintext defaults already match; its retry loop and
  generic credentials options were not modified.
- Replaced the old TLS/local-mode test with a regression checking configuration
  without those fields and with invalid obsolete settings. Updated service/shared
  READMEs and consolidated disclosure; historical prompt/log definitions retained.
- Preserved unrelated in-progress broker/event handler changes and the prior
  approved migration-runner move.

## Actual verification

- 15 affected auth/REST tests passed, zero failures/skips, using local listeners.
- Scoped TypeScript check for src/index.ts and its transitive dependencies passed.
- Real source startup on temporary loopback ports passed with obsolete local/TLS
  values deliberately invalid: plaintext gRPC reached UNAUTHENTICATED without a
  token and INVALID_ARGUMENT with a valid token/invalid user ID. REST balance
  still returned 401 without a JWT, and GET /health returned 200 ok/up against
  local PostgreSQL. Temporary public-key directory removed and child shut down;
  no application-data writes or replacement of the running Credit container.
- Compose/examples checked for removed variables and retained auth variables;
  scoped whitespace/local documentation links checked.
- Full npm run build attempted and blocked by current unedited event-consumer
  files importing unresolved @foc/messaging (broker.ts/userCreated.ts), with
  resulting implicit-any errors. No full-suite or Docker build pass is claimed
  for this exchange. Prior 84 Credit/51 shared counts remain historical.

Human defined the transport change. No architecture/security rationale generated;
no new dependency, skill, sub-agent, external source, commit, push or deployment.
New changes await human review; agent checks do not imply author validation.
