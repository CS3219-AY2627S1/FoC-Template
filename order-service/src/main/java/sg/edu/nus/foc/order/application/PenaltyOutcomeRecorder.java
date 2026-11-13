package sg.edu.nus.foc.order.application;

import java.time.Instant;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import sg.edu.nus.foc.common.penalty.PenaltySystemPolicy;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.PenaltyOutcome;
import sg.edu.nus.foc.order.domain.repository.PenaltyOutcomeRepository;

@Service
@RequiredArgsConstructor
public class PenaltyOutcomeRecorder {
    private final PenaltyOutcomeRepository outcomes;

    @Transactional(propagation = Propagation.MANDATORY)
    public void record(Order order, String courierId, PenaltySystemPolicy policy, String eventId,
            Instant now, String actor, String reason) {
        if (courierId == null) return;
        UUID id = order.ensureCourierAssignmentId();
        if (outcomes.find(id).isPresent()) throw OrderProblem.conflict("This courier attempt already has a penalty outcome.");
        outcomes.save(new PenaltyOutcome(id, order.getId(), courierId, policy, eventId, now, actor, reason));
    }
}
