package sg.edu.nus.foc.order.domain.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import sg.edu.nus.foc.order.domain.PenaltyOutcome;

public interface PenaltyOutcomeRepository {
    Optional<PenaltyOutcome> find(UUID id);
    List<PenaltyOutcome> forOrder(String orderId);
    void save(PenaltyOutcome outcome);
}
