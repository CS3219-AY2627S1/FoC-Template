<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus), date: 2026-11-01.
Scope: Formatted the author's prompts into this archive file.
-->

# Prompt archive: 008

Received 2026-09-28 (Asia/Singapore).

## Prompt 1

```text
I need a /login endpoint for user login
- uses the loginDTO that I already defined
- basically what it does is that it takes in user email and user password, hash
  the provided password, and check if it is the same as the hash stored in the
  user's db, if yes, it returns 200 successful, attached with a JWT token for
  them to use later.
- more details on the JWT workflow, we will sign the JWT with a private key from
  user service, and then distribute the public key to the other services so that
  they can verify the JWT token without calling user service each time when a
  request comes --> authenticate middleware, I alr implemented, js so you have
  more context.
- more on RBAC, we shall attach the roles of the user as part of the JWT claim,
  same thing so that each service can decode their JWT directly and read the
  roles for RBAC control instead of calling user service each time. And because
  JWT token must be signed with a private key, it is very hard to forge a valid
  JWT token, or change the role of a JWT token.
```

## Prompt 2

```text
jwt expire after 15minutes for now, and then algorithm is RSA, error handling
401 if unauthorised user, and then place the logic for JWT signing in the
controller layer.
```

## Prompt 3

```text
ok look alright for now, the next is that I need to create two endpoints to
demonstrate the RBAC and authentication, so the first one would be GET users/me
so only users can view their own profile, and GET /users that only allows users
with role ADMIN to access.
```
