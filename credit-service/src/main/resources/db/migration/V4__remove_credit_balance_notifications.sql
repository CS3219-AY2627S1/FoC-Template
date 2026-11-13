drop trigger if exists credit_balance_created_notification on credit_accounts;
drop trigger if exists credit_balance_updated_notification on credit_accounts;
drop function if exists notify_credit_balance_changed();
