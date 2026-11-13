-- Source order for new scoring outcomes only; existing v1 outcomes remain unchanged.
create table courier_penalty_sequences (
    courier_id varchar(128) primary key,
    last_sequence bigint not null default 0 check (last_sequence >= 0)
);
create table courier_penalty_event_sequences (
    event_id varchar(36) primary key,
    courier_id varchar(128) not null references courier_penalty_sequences(courier_id),
    courier_sequence bigint not null check (courier_sequence > 0),
    unique (courier_id, courier_sequence)
);
