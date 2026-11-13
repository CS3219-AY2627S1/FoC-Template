<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus), date: 2026-11-01.
Scope: Formatted the author's prompts into this archive file.
-->

# Prompt archive: 013

Received 2026-10-14 (Asia/Singapore).

## Prompt 1

```text
Set up a gRPC endpoint so that order service can use this endpoint to retrieve
user profile related information. But take note that this is different from
when users GET /users/me, there are certain info that shouldn't be revealed to
order service. To do this, we will separate into to types of selects, one is
just a normal profile select for users to select their own profile, it will
include the usual things like id, username, firstname, lastname, email, roles,
and createAt time, --> this is for user themselves / admin

the public user select only shows what is necessary for order service, id,
username, firstname and lastname. I want to separate them so it is easier to
modify indepently in the future
```

## Prompt 2

```text
1. yup, deleted users should return not found
2. yes
3. yes, duh, obvi
4. oh yes totally, good catch
5. yep
```

## Prompt 3

```text
sounds a bit confusing, public User Select and PublicProfileSelect is very
confusing, change to just profileSelect and publicProfileSelect
```

## Prompt 4

```text
ok now update the README with the new endpoint
```
