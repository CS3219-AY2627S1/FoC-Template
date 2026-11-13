<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus), date: 2026-11-01.
Scope: Formatted the author's prompt and the quoted review comment into this
archive file.
-->

# Prompt archive: 022

Received 2026-10-20 (Asia/Singapore).

## Review comment (Codex automated review, GitHub PR #64)

```text
On databases upgraded from the parent commit, administrators can legitimately
have roles = ['ADMINISTRATOR'] because the previous README explicitly
instructed operators to create admins that way. Revoking one of those users
stores an empty role array rather than retaining USER, contrary to the endpoint
contract; after login or refresh, that user's token is rejected by
credit-service/src/security/credit-authorizer.ts, which requires
payload.roles.length > 0. Ensure the resulting role set contains USER when
removing ADMINISTRATOR.
```

## Prompt

```text
no need to complicate, I will just ask my teammates to reset their local DB,
you just help me to add a notice in the README to address this, so my
teammates can pick up from the README instructions. I will also mention them
in the groupchat.
```
