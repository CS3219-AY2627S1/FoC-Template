package com.cs3219.foc.order.repository;

import com.cs3219.foc.order.model.entity.DeliveryPhoto;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DeliveryPhotoRepository extends JpaRepository<DeliveryPhoto, UUID> {
    List<DeliveryPhoto> findByErrandIdOrderByCreatedAtAscIdAsc(UUID errandId);
}
