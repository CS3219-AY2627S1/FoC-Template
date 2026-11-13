package com.cs3219.foc.order.repository;

import com.cs3219.foc.order.model.entity.ErrandChatRead;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ErrandChatReadRepository extends JpaRepository<ErrandChatRead, ErrandChatRead.Key> {
    List<ErrandChatRead> findByErrandId(UUID errandId);
}
