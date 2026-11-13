create table orders (
    id varchar(36) primary key,
    requester_id varchar(128) not null,
    courier_id varchar(128),
    item_description varchar(100) not null,
    pickup_supplier_id varchar(128) not null,
    delivery_supplier_id varchar(128) not null,
    offered_credits bigint not null,
    status varchar(20) not null,
    created_at timestamp with time zone not null,
    expires_at timestamp with time zone not null,
    delivery_time_limit_minutes integer not null,
    version bigint not null default 0,
    original_order_id varchar(36),
    reposted_order_id varchar(36),
    enabled boolean,
    due_at timestamp with time zone,
    credit_amount bigint,
    delivery_duration_minutes integer,
    used boolean,
    constraint ux_order_repost_original unique (original_order_id)
);

create table order_checkpoints (
    id varchar(36) primary key,
    order_id varchar(36) not null references orders(id),
    status varchar(20) not null,
    occurred_at timestamp with time zone not null,
    actor_id varchar(128),
    supplier_id varchar(128),
    constraint ux_order_checkpoint unique (order_id, status)
);

create index ix_orders_available on orders(status, created_at);
create index ix_orders_expiry on orders(status, expires_at);

create table command_receipts (
    id varchar(36) primary key,
    operation varchar(80) not null,
    command_id varchar(128) not null,
    order_id varchar(36) not null,
    recorded_at timestamp with time zone not null,
    constraint ux_command_operation unique (operation, command_id)
);
