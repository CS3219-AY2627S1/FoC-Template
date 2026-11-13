<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus), date: 2026-11-01.
Scope: Formatted the author's prompts into this archive file.
-->

# Prompt archive: 001

Received 2026-09-24 – 2026-09-25 (Asia/Singapore).

## Prompt 1

```text
I need to layout my inital scaffolding for user-service. These are the tech
stack that I've decided with:
- Express REST
- prisma with postgresql for DB and ORM, and migration management
- gRPC for internal service
- Dockerfile with compose.yml
can you first roughly plan out, and then after that we do each scaffolding step
by step
```

## Prompt 2

```text
schema for User is :
id (PK), username (unique), firstName, lastname, email (unique), passwordHash
(bcrypt), roles (enum Roles[]), isDeleted for soft deletion, createdAt,
updatedAt

for Roles, { USER, ADMINISTRATOR }
```

## Prompt 3

```text
will have one endpoint for internal services like order service to get public
profile, it should only inclde the absolute necessaries, (userId, firstname,
lastname, username)
```

## Prompt 4

```text
can you explain what it is doing?
```

## Prompt 5

```text
ok approve
```

## Prompt 6

```text
yes
```

## Prompt 7

```text
ok approve
```

## Prompt 8

```text
ok approve, .env should be ignored, but .env.example shoudn't because that is
for me to communicate with the other teammates so they know what env vars are
needed, and setup is easier for them also
```

## Prompt 9

```text
two stages, build stage and runtime stage, will be using node:20-slim, and a
standard layout.
```

## Prompt 10

```text
can you please explain each line, line by line.
```

## Prompt 11

```text
why npm ci?
```

## Prompt 12

```text
ok looks okay to me, move on to compose.yml,
two containers, user_sevice and postgres, and the user-service will apply
migrations then start the app.
```

## Prompt 13

```text
can you explain more on the volumes: what do they do
```

## Prompt 14

```text
ok, can for now, approve
```

## Prompt 15

```text
update the README.md file and AGENTS.md, include a section on how to setup,
easy setup and dev setup,
```
