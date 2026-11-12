/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-08
 * Scope: Implementation and test assistance for notification schema constraints.
 */
package com.campuscouriers.notification_service.config;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.context.annotation.DependsOn;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Applies constraints that Hibernate creates for new tables but does not reliably add to
 * existing tables when ddl-auto=update is used. This can be replaced by a versioned database
 * migration once the service adopts a migration tool.
 */
@Component
@DependsOn("entityManagerFactory")
public class NotificationSchemaConstraints implements InitializingBean {
    private final JdbcTemplate jdbc;

    public NotificationSchemaConstraints(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void afterPropertiesSet() {
        jdbc.execute("""
            DO $$
            BEGIN
                LOCK TABLE notifications IN ACCESS EXCLUSIVE MODE;
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'chk_notification_chat_fields'
                      AND conrelid = 'notifications'::regclass
                ) THEN
                    ALTER TABLE notifications
                    ADD CONSTRAINT chk_notification_chat_fields
                    CHECK (
                        (
                            type = 'CHAT_MESSAGE'
                            AND conversation_id IS NOT NULL
                            AND message_id IS NOT NULL
                        )
                        OR
                        (
                            type <> 'CHAT_MESSAGE'
                            AND conversation_id IS NULL
                            AND message_id IS NULL
                        )
                    );
                END IF;
            END
            $$
            """);
    }
}
