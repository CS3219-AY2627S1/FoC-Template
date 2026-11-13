package com.friendoncampus.user.messaging;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class UserSanctionOutbox {
    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    public UserSanctionOutbox(JdbcTemplate db,PlatformTransactionManager manager) { this.db=db;tx=new TransactionTemplate(manager);tx.setTimeout(10); }
    public record Delivery(UUID event,UUID operation,UUID target,String payload,UUID lease,long generation) { }
    public List<Delivery> claim() {
        return tx.execute(s->{
            var rows=db.queryForList("SELECT * FROM user_sanction_outbox WHERE published_at IS NULL AND next_attempt_at<=CURRENT_TIMESTAMP AND (lease_until IS NULL OR lease_until<CURRENT_TIMESTAMP) ORDER BY next_attempt_at,event_id LIMIT 10 FOR UPDATE SKIP LOCKED");
            List<Delivery> result=new ArrayList<>();
            for(var r:rows){UUID lease=UUID.randomUUID();db.update("UPDATE user_sanction_outbox SET lease_id=?,lease_until=CURRENT_TIMESTAMP+INTERVAL '30 seconds',attempts=attempts+1 WHERE event_id=?",lease,r.get("event_id"));
                result.add(new Delivery((UUID)r.get("event_id"),(UUID)r.get("operation_id"),(UUID)r.get("target_user_id"),(String)r.get("payload"),lease,((Number)r.get("dispatch_version")).longValue()));}
            return result;
        });
    }
    public void confirmed(Delivery d) { db.update("UPDATE user_sanction_outbox SET published_at=CURRENT_TIMESTAMP,lease_id=NULL,lease_until=NULL WHERE event_id=? AND lease_id=? AND dispatch_version=?",d.event,d.lease,d.generation); }
    public void failed(Delivery d) { db.update("UPDATE user_sanction_outbox SET lease_id=NULL,lease_until=NULL,next_attempt_at=CURRENT_TIMESTAMP+INTERVAL '10 seconds' WHERE event_id=? AND lease_id=?",d.event,d.lease); }
}
