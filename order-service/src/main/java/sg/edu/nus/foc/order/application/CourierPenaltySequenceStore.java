package sg.edu.nus.foc.order.application;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import sg.edu.nus.foc.order.domain.OrderProblem;

/** Counter, identity binding, outcome and outbox must share the business transaction. */
@Repository
@RequiredArgsConstructor
public class CourierPenaltySequenceStore {
    private final JdbcTemplate jdbc;

    @Transactional(propagation = Propagation.MANDATORY)
    public long assign(String courierId, String eventId) {
        jdbc.update("insert into courier_penalty_sequences(courier_id) values (?) on conflict do nothing", courierId);
        jdbc.queryForObject("select last_sequence from courier_penalty_sequences where courier_id=? for update", Long.class, courierId);
        var previous = jdbc.queryForList("select courier_id,courier_sequence from courier_penalty_event_sequences where event_id=?", eventId);
        if (!previous.isEmpty()) {
            if (!courierId.equals(previous.getFirst().get("courier_id"))) {
                throw OrderProblem.conflict("Penalty event already belongs to another courier.");
            }
            return ((Number) previous.getFirst().get("courier_sequence")).longValue();
        }
        long sequence = jdbc.queryForObject("update courier_penalty_sequences set last_sequence=last_sequence+1 where courier_id=? returning last_sequence", Long.class, courierId);
        jdbc.update("insert into courier_penalty_event_sequences(event_id,courier_id,courier_sequence) values (?,?,?)", eventId, courierId, sequence);
        return sequence;
    }
}
