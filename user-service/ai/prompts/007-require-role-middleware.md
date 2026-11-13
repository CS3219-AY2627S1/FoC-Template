<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus), date: 2026-10-30.
Scope: Formatted the author's prompt into this archive file.
-->

# Prompt archive: 007

Received 2026-09-28 (Asia/Singapore).

## Prompt

```text
after authentication, we need a RABC guard to check user's roles, so that only
user's with a certain role can access a protected endpoint. generate a role
check middleware, so that for protected endpoints, I can use this middleware to
check if the user has sufficient role to proceed. A user must have at least one
of the given roles provided to the middleware to be allowed through.
```

```text
uh, I think 401 for when there's no authenticated user, and403 when the user lacks the role
```
