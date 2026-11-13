package sg.edu.nus.foc.order.infrastructure;
import java.util.*;
import sg.edu.nus.foc.order.domain.PenaltyOutcome;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;
import sg.edu.nus.foc.order.domain.repository.PenaltyOutcomeRepository;
@Repository @RequiredArgsConstructor
public class PenaltyOutcomePersistenceAdapter implements PenaltyOutcomeRepository {
 private final JpaPenaltyOutcomeRepository outcomes;
 public Optional<PenaltyOutcome> find(UUID id){return outcomes.findById(id);}
 public List<PenaltyOutcome> forOrder(String id){return outcomes.findByOrderIdOrderByCreatedAtAsc(id);}
 public void save(PenaltyOutcome outcome){outcomes.save(outcome);}
}
