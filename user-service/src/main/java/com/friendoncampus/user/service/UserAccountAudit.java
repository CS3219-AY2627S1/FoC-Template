package com.friendoncampus.user.service;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserAccountAudit {
    private final JdbcTemplate db;
    public UserAccountAudit(JdbcTemplate db) { this.db = db; }

    @Transactional(propagation = Propagation.MANDATORY)
    public void record(UUID actor, UUID target, UUID operation, String action, String result, String reason) {
        db.update("INSERT INTO user_account_audit(id,actor_id,target_user_id,operation_id,action,result,reason) VALUES (?,?,?,?,?,?,?)",
                UUID.randomUUID(), actor, target, operation, action, result, reason);
    }
}
