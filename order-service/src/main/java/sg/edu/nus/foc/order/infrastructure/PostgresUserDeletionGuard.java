package sg.edu.nus.foc.order.infrastructure;

import java.util.Arrays;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.repository.UserDeletionGuard;

@Repository
@RequiredArgsConstructor
public class PostgresUserDeletionGuard implements UserDeletionGuard {
    private final JdbcTemplate jdbc;

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void requireAllowed(String... userIds) {
        // All participants use the same deterministic order, including first-use row creation.
        for (String uid : Arrays.stream(userIds).filter(id -> id != null).distinct().sorted().toList()) {
            if (lock(uid)) throw OrderProblem.forbidden("Account deletion prevents new order work.");
        }
    }

    @Override
    @Transactional
    public boolean prepare(String userId, String operationId) {
        requireId(userId);
        requireId(operationId);
        boolean blocked = lock(userId);
        List<Boolean> previous = jdbc.queryForList("""
                select granted from order_user_deletion_preparations where user_id=? and operation_id=?
                """, Boolean.class, userId, operationId);
        if (!previous.isEmpty()) return previous.getFirst();
        if (blocked) {
            // Another operation may have deleted Firebase already: never misreport this as an active-order denial.
            throw new OrderProblem("SERVICE_UNAVAILABLE", "A different deletion operation already owns this account barrier.");
        }
        boolean involved = Boolean.TRUE.equals(jdbc.queryForObject("""
                select exists(select 1 from orders where status not in ('COMPLETED','CANCELLED','EXPIRED')
                    and (requester_id=? or courier_id=?))
                  or exists(select 1 from order_commands c left join orders o on o.id=c.order_id
                    where c.status='PENDING' and (c.actor_id=? or o.requester_id=? or o.courier_id=?))
                """, Boolean.class, userId, userId, userId, userId, userId));
        boolean granted = !involved;
        jdbc.update("insert into order_user_deletion_preparations(user_id,operation_id,granted) values (?,?,?)",
                userId, operationId, granted);
        if (granted) {
            jdbc.update("update order_user_deletion_guards set blocked=true,operation_id=? where user_id=?",
                    operationId, userId);
        }
        return granted;
    }

    private boolean lock(String uid) {
        requireId(uid);
        jdbc.update("insert into order_user_deletion_guards(user_id) values (?) on conflict do nothing", uid);
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "select blocked from order_user_deletion_guards where user_id=? for update", Boolean.class, uid));
    }

    private static void requireId(String id) {
        if (id == null || id.isBlank() || id.length() > 128) {
            throw new OrderProblem("VALIDATION_ERROR", "An ID of 1 through 128 characters is required.");
        }
    }
}
