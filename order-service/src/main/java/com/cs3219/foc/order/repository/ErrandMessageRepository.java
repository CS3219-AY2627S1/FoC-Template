package com.cs3219.foc.order.repository;

import com.cs3219.foc.order.model.entity.ErrandMessage;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ErrandMessageRepository extends JpaRepository<ErrandMessage, UUID> {
    List<ErrandMessage> findByErrandIdOrderBySentAtAscIdAsc(UUID errandId);
}
