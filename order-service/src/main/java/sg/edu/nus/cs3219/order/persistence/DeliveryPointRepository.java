package sg.edu.nus.cs3219.order.persistence;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface DeliveryPointRepository extends JpaRepository<DeliveryPointEntity, Long> {

    Page<DeliveryPointEntity> findByCodeIsNotNullAndActiveTrueOrderByIdAsc(Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from DeliveryPointEntity p where p.id = :id")
    Optional<DeliveryPointEntity> lockById(@Param("id") Long id);

    @Query("""
            select p from DeliveryPointEntity p
            where p.id in :ids and p.active = true
            """)
    List<DeliveryPointEntity> findActiveByIdIn(@Param("ids") Collection<Long> ids);
}
