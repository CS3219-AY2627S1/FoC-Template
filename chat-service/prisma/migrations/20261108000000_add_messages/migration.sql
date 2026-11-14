-- AI Assistance Disclosure:
-- Tool: Codex (model: GPT-6), date: 2026-11-08
-- Scope: Generated migration from the team-supplied message schema.
-- No requirements, architecture, schema, or API decisions were made by the AI tool.
-- Author review: tng wen xi
-- CreateTable
CREATE TABLE `messages` (
    `id` CHAR(36) NOT NULL,
    `chat_id` CHAR(36) NOT NULL,
    `sender_id` CHAR(36) NULL,
    `type` ENUM('TEXT', 'IMAGE', 'VIDEO', 'SYSTEM') NOT NULL,
    `content` TEXT NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_chat_id_fkey` FOREIGN KEY (`chat_id`) REFERENCES `chats`(`conversation_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

