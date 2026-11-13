/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-14
 * Mode: Database migration generation.
 * Scope: Generated the PostgreSQL index supporting stable system-wide transaction history queries.
 * Author review: Pending final human review; migration verification passed.
 */
create index ix_credit_ledger_global_history
    on credit_ledger(occurred_at desc, created_at desc, entry_id desc);
