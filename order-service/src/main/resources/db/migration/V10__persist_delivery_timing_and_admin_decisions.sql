-- CHANGE-135 / ADR-045: delivery starts at START, never at ACCEPT.
alter table orders add column delivery_deadline_at timestamp with time zone;
alter table orders add column delivered_at timestamp with time zone;
alter table orders add column admin_penalty_decision varchar(24);
alter table orders add column admin_penalty_reason varchar(64);
alter table orders add column admin_penalty_amount integer;
alter table orders add column admin_resolution_at timestamp with time zone;

-- Only evidence from the current courier's most recent acceptance is safe.
with accepted as (
    select o.id, max(c.occurred_at) as accepted_at
    from orders o join order_checkpoints c on c.order_id = o.id
    where o.courier_id is not null and c.actor_id = o.courier_id
      and c.status = 'ACCEPTED'
      and o.status in ('IN_PROGRESS', 'PICKED_UP', 'DELIVERED', 'COMPLETED', 'CANCELLED')
    group by o.id
), started as (
    select o.id, max(c.occurred_at) as started_at
    from orders o join accepted a on a.id = o.id
    join order_checkpoints c on c.order_id = o.id
    where c.status = 'IN_PROGRESS' and c.actor_id = o.courier_id
      and c.occurred_at >= a.accepted_at
    group by o.id
), timing as (
    select o.id, s.started_at, max(c.occurred_at) as delivered_at
    from orders o join started s on s.id = o.id
    left join order_checkpoints c on c.order_id = o.id
      and c.status = 'DELIVERED' and c.actor_id = o.courier_id
      and c.occurred_at >= s.started_at
      and o.status in ('DELIVERED', 'COMPLETED', 'CANCELLED')
    group by o.id, s.started_at
)
update orders o set delivery_deadline_at = t.started_at + o.delivery_time_limit_minutes * interval '1 minute',
    delivered_at = t.delivered_at
from timing t where t.id = o.id;

-- Historical decisions stay unknown; absence of a penalty is not proof of waiver.
update orders o set admin_resolution_at = r.recorded_at
from command_receipts r
where r.order_id = o.id and r.operation = 'ADMIN_CANCEL' and o.status = 'CANCELLED';

alter table orders add constraint ck_order_admin_penalty_decision check (
    case admin_penalty_decision
        when 'WAIVED' then admin_resolution_at is not null and admin_penalty_reason is null
            and admin_penalty_amount is not null and admin_penalty_amount = 0
        when 'ADDITION_REQUESTED' then admin_resolution_at is not null and admin_penalty_reason is not null
            and admin_penalty_amount is not null and admin_penalty_amount > 0
        else admin_penalty_decision is null and admin_penalty_reason is null and admin_penalty_amount is null
    end
);

create index ix_orders_auto_completion on orders(delivered_at, created_at, id)
    where status = 'DELIVERED' and completion_hold = false and delivery_deadline_at is not null;
