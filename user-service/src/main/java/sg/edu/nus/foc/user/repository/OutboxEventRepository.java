package sg.edu.nus.foc.user.repository;

import java.util.List;

import org.springframework.data.mongodb.repository.MongoRepository;
import sg.edu.nus.foc.user.model.OutboxEvent;

public interface OutboxEventRepository
        extends MongoRepository<OutboxEvent, String> {
    List<OutboxEvent> findTop100ByStatusOrderByCreatedAtAsc(String status);
}
