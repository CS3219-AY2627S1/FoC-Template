package com.friendoncampus.admin;

import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Short database leases protect independent replicas; no transaction spans broker I/O. */
@Service
public class ActionDeliveryStore {
    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    public ActionDeliveryStore(JdbcTemplate db,PlatformTransactionManager manager){this.db=db;tx=new TransactionTemplate(manager);tx.setTimeout(10);}
    public record Delivery(UUID eventId,UUID operationId,UUID target,UUID lease,String payload,String topic) {
        public Delivery(UUID eventId,UUID operationId,UUID target,UUID lease,String payload){this(eventId,operationId,target,lease,payload,"admin.credit.commands");}
    }
    public List<Delivery> claim(){
        return tx.execute(s->{
            db.execute("SET LOCAL lock_timeout='5s'");
            db.update("UPDATE admin_actions SET status='UNKNOWN' WHERE status='PENDING' AND deadline_at<=CURRENT_TIMESTAMP");
            var rows=db.queryForList("SELECT o.* FROM admin_action_outbox o JOIN admin_actions a ON a.operation_id=o.operation_id WHERE a.status IN ('PENDING','UNKNOWN') AND o.next_attempt_at<=CURRENT_TIMESTAMP AND (o.lease_until IS NULL OR o.lease_until<CURRENT_TIMESTAMP) ORDER BY o.next_attempt_at,o.event_id LIMIT 1 FOR UPDATE OF o SKIP LOCKED");
            List<Delivery> result=new ArrayList<>();
            for(var r:rows){UUID lease=UUID.randomUUID();db.update("UPDATE admin_action_outbox SET lease_id=?,lease_until=CURRENT_TIMESTAMP+INTERVAL '30 seconds',attempts=attempts+1 WHERE event_id=?",lease,r.get("event_id"));
                result.add(new Delivery((UUID)r.get("event_id"),(UUID)r.get("operation_id"),(UUID)r.get("target_user_id"),lease,(String)r.get("payload"),(String)r.get("topic")));}
            return result;
        });
    }
    public void confirmed(Delivery d,long reconcileSeconds){
        db.update("UPDATE admin_action_outbox SET published_at=COALESCE(published_at,CURRENT_TIMESTAMP),next_attempt_at=?,lease_id=NULL,lease_until=NULL,last_error=NULL WHERE event_id=? AND lease_id=?",CreditActionService.at(Instant.now().plusSeconds(reconcileSeconds)),d.eventId,d.lease);
    }
    public void failed(Delivery d){
        db.update("UPDATE admin_action_outbox SET next_attempt_at=CURRENT_TIMESTAMP+INTERVAL '10 seconds',lease_id=NULL,lease_until=NULL,last_error='BROKER_UNCONFIRMED' WHERE event_id=? AND lease_id=?",d.eventId,d.lease);
    }
}
