-- AI Assistance Disclosure:
-- Tool: Codex (model: GPT-6), date: 2026-11-07
-- Scope: Generated migration for team-specified conversation and participant fields.
-- No requirements, architecture, schema, or API decisions were made by the AI tool.
-- Author review: tng wen xi
-- CreateTable
CREATE TABLE `chats` (
    `conversation_id` CHAR(36) NOT NULL,
    `order_id` CHAR(36) NOT NULL,
    `chat_title` TEXT NOT NULL,
    `status` ENUM('ACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `chats_order_id_key`(`order_id`),
    INDEX `chats_updated_at_conversation_id_idx`(`updated_at`, `conversation_id`),
    PRIMARY KEY (`conversation_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chat_participants` (
    `id` CHAR(36) NOT NULL,
    `chat_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `role` ENUM('REQUESTER', 'COURIER') NOT NULL,
    `last_read_message_id` CHAR(36) NULL,
    `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revoked_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `chat_participants` ADD CONSTRAINT `chat_participants_chat_id_fkey` FOREIGN KEY (`chat_id`) REFERENCES `chats`(`conversation_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
