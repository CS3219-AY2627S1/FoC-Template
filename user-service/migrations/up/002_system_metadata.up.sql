-- AI Assistance Disclosure:
-- Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-29
-- Scope: Generated the initial implementation of the Day 0 admin bootstrap
-- system metadata table based on the finalized team design.
-- Author review: Reviewed and validated against the finalized project design.

CREATE TABLE IF NOT EXISTS system_metadata (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
