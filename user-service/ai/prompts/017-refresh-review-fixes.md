<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus), date: 2026-11-01.
Scope: Formatted the author's prompts and the quoted review comments into this
archive file.
-->

# Prompt archive: 017

Received 2026-10-19 (Asia/Singapore).

## Review comments (Codex automated review, GitHub PR #56)

```text
When two tabs refresh the same token concurrently, one rotation succeeds and
sets the replacement cookie while the loser returns ok: false and clears that
cookie. If the losing response is processed last, it deletes the winner's new
cookie, so the documented retry still has no token to send and the user is
logged out. A replay caused by a concurrent rotation must not blindly expire the
browser's potentially newer cookie.
```

```text
When a refresh request overlaps logout and its transaction commits first,
rotation revokes the presented token and creates a successor, but logout only
revokes the now-dead predecessor. If the refresh response subsequently sets its
cookie, the browser retains a valid session and can mint new access tokens
after logout, so logout does not reliably terminate the session. Track and
revoke the whole session/token family or otherwise synchronize logout with
rotation.
```

```text
Every successful refresh inserts a new RefreshToken row, while rotation and
logout only set revokedAt; there is no deletion or cleanup path elsewhere in
user-service. Consequently the table and its unique index grow with every login
and refresh indefinitely, even though almost all rows can no longer
authenticate, which will steadily increase database storage and maintenance
costs. Delete superseded rows during rotation or add an expiry/revocation
cleanup policy.
```

## Prompt 1

```text
<the three review comments above>
can you explain these comments to me please, and then we fix one by one
```

## Prompt 2

```text
for the first issue, I guess we could do something like this:
- we try to distinguish between whether it is caused by an actual invalid
  token, or just because it was superseded
- if it was caused by an actual invalid token, then we continue with our usual
  flow
- if it was caused by a supersede, then we make sure not to clear the cookie
- we can detect whether the token is just recently superseded by maintaining
  the previous hash token in our db, then we will be able to determine whether
  they are the same
```

## Prompt 3

```text
1. ok sure, make the rotation update the same row instead of inserting a new
row each time.

2. only the imediately previous token, since I think the superseding
concurrency case usually only happens in a short period

3. yup, make sure the client preserve the cookie only when a newer valid
session token aleady exists

4. uhhhhhh, yeah leave the cookie alone
```

## Prompt 4

```text
ok good, now let's update the README
```
