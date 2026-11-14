-- AI Assistance Disclosure:
-- Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-09
-- Scope: Wrote the migration for the team-specified translate_to column and translated_messages table.
--        No requirements, architecture, schema, or API decisions were made by the AI tool.
-- Author review: Congchen
-- AlterTable
ALTER TABLE `conversation_participants` ADD COLUMN `translate_to` VARCHAR(2) NULL;

-- CreateTable
CREATE TABLE `translated_messages` (
    `id` CHAR(36) NOT NULL,
    `message_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `content` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `translated_messages_message_id_user_id_key`(`message_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `translated_messages` ADD CONSTRAINT `translated_messages_message_id_fkey` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
