<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), date: 2026-10-20 (Asia/Singapore).
Scope: Archived the human's exact finalized advisory-key encoding and the implementation response.
-->

# Prompt archive — 019

## Exact user reply

```text
lock text: json text of 2 element array holding namespace and key, both strings. 
hash: take sha-256 of text's UTF-8 bytes
bigint: read the first 8 bytes as a big-endian signed 64-bit integer then pass it to the lock as a decimal string
```

## Key assistant response (verbatim)

I’ll implement that encoding, use it for the service’s advisory locks, and update the concurrency tests to exercise it.

## Key implementation response

Added the exact JSON.stringify([namespace, key]) / UTF-8 / SHA-256 /
readBigInt64BE(0) mapping. SqlCreditRepository passes its bigint value as a decimal
string to the existing pg_advisory_xact_lock($1::bigint) query. Removed the
temporary injected encoder from constructors; CreditService now takes only its
pg pool. PostgreSQL tests use the production encoder and independently computed
fixed signed-64-bit lock identifiers.
