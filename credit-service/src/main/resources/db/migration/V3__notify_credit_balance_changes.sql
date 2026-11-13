create function notify_credit_balance_changed()
returns trigger
language plpgsql
as $$
begin
    perform pg_notify('credit_balance_changed', new.user_id);
    return new;
end;
$$;

create trigger credit_balance_created_notification
after insert on credit_accounts
for each row
execute function notify_credit_balance_changed();

create trigger credit_balance_updated_notification
after update of total_balance, reserved_balance on credit_accounts
for each row
when (
    old.total_balance is distinct from new.total_balance
    or old.reserved_balance is distinct from new.reserved_balance
)
execute function notify_credit_balance_changed();
