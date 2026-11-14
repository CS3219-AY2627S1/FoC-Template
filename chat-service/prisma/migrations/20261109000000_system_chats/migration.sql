-- AI Assistance Disclosure:
-- Tool: Codex (model: GPT-6), date: 2026-11-09
-- Scope: Implemented the team-specified system chat schema.
-- No requirements, architecture, schema, or API decisions were made by the AI tool.
-- Author review: tng wen xi
ALTER TABLE `conversations` MODIFY `order_id` CHAR(36) NULL;
ALTER TABLE `conversation_participants` MODIFY `role` ENUM('REQUESTER', 'COURIER') NULL;
CREATE TABLE `system_chats` (
  `user_id` CHAR(36) NOT NULL,
  `conversation_id` CHAR(36) NOT NULL,
  PRIMARY KEY (`user_id`),
  UNIQUE INDEX `system_chats_conversation_id_key` (`conversation_id`),
  CONSTRAINT `system_chats_conversation_id_fkey` FOREIGN KEY (`conversation_id`)
    REFERENCES `conversations` (`conversation_id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
