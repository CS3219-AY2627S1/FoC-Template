package com.friendoncampus.admin;

import io.micrometer.core.instrument.*;
import io.micrometer.core.instrument.binder.MeterBinder;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Aggregate observability only: no reasons, bodies, identities or tokens in metric labels. */
@Component
public class ActionMetrics implements MeterBinder {
    private final JdbcTemplate db;
    public ActionMetrics(JdbcTemplate db){this.db=db;}
    @Override public void bindTo(MeterRegistry registry){
        for(var kind:java.util.Map.of("credit","CREDIT_ADJUSTMENT","ban","BAN").entrySet()){
            String filter="type='"+kind.getValue()+"' AND ";
            gauge(registry,"admin."+kind.getKey()+".actions.pending","SELECT count(*) FROM admin_actions WHERE "+filter+"status='PENDING' AND deadline_at>CURRENT_TIMESTAMP");
            gauge(registry,"admin."+kind.getKey()+".actions.unknown","SELECT count(*) FROM admin_actions WHERE "+filter+"(status='UNKNOWN' OR status='PENDING' AND deadline_at<=CURRENT_TIMESTAMP)");
            gauge(registry,"admin."+kind.getKey()+".outbox.unconfirmed","SELECT count(*) FROM admin_action_outbox o JOIN admin_actions a USING(operation_id) WHERE a."+filter+"o.published_at IS NULL AND a.status IN ('PENDING','UNKNOWN')");
            gauge(registry,"admin."+kind.getKey()+".actions.oldest.unconfirmed.seconds","SELECT COALESCE(MAX(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP-created_at))),0) FROM admin_actions WHERE "+filter+"status IN ('PENDING','UNKNOWN')");
        }
        gauge(registry,"admin.actions.outcomes.quarantined","SELECT count(*) FROM admin_action_quarantine");
        // Legacy name retained for existing dashboards; quarantine is shared across action types.
        gauge(registry,"admin.credit.outcomes.quarantined","SELECT count(*) FROM admin_action_quarantine");
    }
    private void gauge(MeterRegistry registry,String name,String sql){Gauge.builder(name,db,d->{try{Number n=d.queryForObject(sql,Number.class);return n==null?Double.NaN:n.doubleValue();}catch(Exception e){return Double.NaN;}}).register(registry);}
}
