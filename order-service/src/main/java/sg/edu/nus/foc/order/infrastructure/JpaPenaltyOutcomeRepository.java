package sg.edu.nus.foc.order.infrastructure;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import sg.edu.nus.foc.order.domain.PenaltyOutcome;

public interface JpaPenaltyOutcomeRepository extends JpaRepository<PenaltyOutcome, UUID> {
    List<PenaltyOutcome> findByOrderIdOrderByCreatedAtAsc(String orderId);
}
