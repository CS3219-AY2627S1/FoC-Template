alter table credit_ledger
    add column command_id varchar(128)
        references credit_command_records(command_id);

create index ix_credit_ledger_command
    on credit_ledger(command_id)
    where command_id is not null;
