<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus), date: 2026-11-01.
Scope: Formatted the author's prompts into this archive file.
-->

# Prompt archive: 018

Received 2026-10-19 (Asia/Singapore).

## Prompt 1

```text
create a new table for systemBootstrap, this table on has a singleton row, for
indicating that the system is initialised or not. Once this singleton row
exists, it means that the system already initialised with an admin, and
therefore the bootstrap wouldn't run again upon later runs
this the schema: SystemBootstrap, id (PK), initializationAt (datetime),
adminUserId
```

## Prompt 2

```text
yea yeah
```

## Prompt 3

```text
okay now create a table for admin role change audit. this is to fulfil the
reporducibility and auditability requirement from the
resource-bootstrap-first-admin resourve provided by the teaching team, schema
like this:
AdminRoleChange with id (PK), actorId (this one refers to the person who
initiated the admin role change), targetId (the person being role changed),
action (enum AdminRoleAction), createdAt (datetime).
index on targetId.
```

## Prompt 4

```text
1. when it is initiated by a system boostrap, put the actorId as null
2. no, they shouldn't point to User, this is just an audit record, it needs to
survive even if an account is deleted, ain't that the whole point of audit
records?
3. yup
```
