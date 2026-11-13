<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus), date: 2026-11-01.
Scope: Formatted the author's prompts into this archive file.
-->

# Prompt archive: 020

Received 2026-10-19 (Asia/Singapore).

## Prompt 1

```text
I need to add two more adminstrator related endpoints, let's start with the
first one:
granting admin role: POST /users/:id/admin
- protected route, requires Admin role
- updates the users role to admin
- idempotent, doesn't matter if the user alr have admin role before or not,
  both will return the same outcome
- add an audit row to "adminRoleChange" table, make sure to handle these
  queries in a transaction
handle race condition by using the pg_lock
```

## Prompt 2

```text
- OMG, what a great point, I would not have thought of this damn, uhm yeah you
  should definitely recheck if the caller is still an active admin, and reject
  with a 403 if they're not an admin
- if target user doesn't exist or deleted, return 404 not found
```

## Prompt 3

```text
now generate another endpoint for revoking admin role --> DELETE
/users/:id/admin

- same thing, it should be idempotent, doesn't matter if the role is held
  before or not, the final outcome is the same
- also a protected endpoint, require role ADMIN
- need to handle last Admin protection, which means it will first check if
  there's other admins left, if no other admins left, that means I am the only
  admin left, which means you can't revoke me
```

## Prompt 4

```text
1. yes, these two admin endpoints should only meddle with the ADMIN role and
nothing else

2. ok

3. I thought this case is already handled by the pg_lock

4. sure
5. sure why not, if they want to
6. yes
```

## Prompt 5

```text
ok can
```
