<!--
AI Assistance Disclosure:
Tool: OpenAI Codex, 2026-11-02 (Asia/Singapore).
Scope: Formatted the author's prompt into this archive file.
-->

# Prompt archive: 030

Received 2026-11-02 (Asia/Singapore).

## Prompt 1

```text
I need to implement a purge job workflow, so what happen is that once a day, it will delete every archive row that is expired, which is past its purgeAfter time, it will run once at startup, then run once every day.

Note that we don't need to publish a user.purged event or some sort for this, because other services no need to do anything after 4 years.
```
