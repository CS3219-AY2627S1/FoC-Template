ALTER TABLE admin_actions ADD COLUMN type VARCHAR(32) NOT NULL DEFAULT 'CREDIT_ADJUSTMENT';
ALTER TABLE admin_actions ALTER COLUMN amount DROP NOT NULL;
ALTER TABLE admin_actions ADD CONSTRAINT admin_action_type_amount CHECK (
    (type='CREDIT_ADJUSTMENT' AND amount IS NOT NULL AND amount<>0)
    OR (type='BAN' AND amount IS NULL)
);
ALTER TABLE admin_action_outbox ADD COLUMN topic VARCHAR(64) NOT NULL DEFAULT 'admin.credit.commands';
ALTER TABLE admin_action_outbox ADD CONSTRAINT admin_action_topic CHECK (topic IN ('admin.credit.commands','admin.user.commands'));
