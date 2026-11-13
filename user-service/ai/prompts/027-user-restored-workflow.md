<!--
AI Assistance Disclosure:
Tool: OpenAI Codex, 2026-11-02 (Asia/Singapore).
Scope: Formatted the author's prompts into this archive file.
-->

# Prompt archive: 027

Received 2026-11-02 (Asia/Singapore).

## Prompt 1

```text
now we need to implement user.restored workflow.
First, in userService.register, we need to check for duplicate email or username, and then after that we check if there is an archived deleted row involving this email address.

If yes --> will notify the user about the restore, but say will not be restoring anything else other than credit balance --> user confirm --> we save the archived userId somewhere, and then continue with the usual user registration workflow, then instead of enqueueing a user.created event, we enqueue a user.restored event with its (new) userId and previousUserId.

if no --> we follow the usual user registration workflow, then enqueue a user.restored event (as usual)

implement the buildUserRestored, enqueueUserRestored as per usual
```

## Prompt 2

```text
yes, when there are no archived row, the registration should enqueue the existing user.created event
```

## Prompt 3

```text
add a confirmRestore field in registerDro
```
