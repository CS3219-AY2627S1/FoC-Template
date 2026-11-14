-- AI Assistance Disclosure:
-- Tool: Codex (model: GPT-6), date: 2026-11-08
-- Scope: Implemented the team-requested table renames without replacing existing tables.
-- No requirements, architecture, schema, or API decisions were made by the AI tool.
-- Author review: tng wen xi

-- MySQL retains rows, indexes and foreign-key references when tables are renamed.
RENAME TABLE `chats` TO `conversations`,
             `chat_participants` TO `conversation_participants`;
