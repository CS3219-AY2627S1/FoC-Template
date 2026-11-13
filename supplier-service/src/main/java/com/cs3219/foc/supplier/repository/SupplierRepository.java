package com.cs3219.foc.supplier.repository;

import com.cs3219.foc.supplier.model.entity.Supplier;
import jakarta.persistence.LockModeType;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SupplierRepository extends JpaRepository<Supplier, UUID>, JpaSpecificationExecutor<Supplier> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from Supplier s where s.id = :id")
    Optional<Supplier> findForUpdateById(UUID id);

    // get opening hours in the same query for every supplier, to avoid extra query
    @Override
    @EntityGraph(attributePaths = "openingHours")
    List<Supplier> findAll(Specification<Supplier> spec, Sort sort);

    @Override
    @EntityGraph(attributePaths = "openingHours")
    Optional<Supplier> findById(UUID id);

    @EntityGraph(attributePaths = "openingHours")
    Optional<Supplier> findByIdAndActiveTrue(UUID id);

    /** @return 1 when the supplier was inserted, 0 when that id was already stored */
    @Modifying
    @Query(nativeQuery = true, value = """
                    INSERT INTO suppliers (
                        id, name, category, building, floor, location_description,
                        latitude, longitude, active, created_at, updated_at
                    ) VALUES (
                        :id, :name, :category, :building, :floor, :locationDescription,
                        :latitude, :longitude, :active, now(), now()
                    )
                    ON CONFLICT (id) DO NOTHING
                    """)
    int insertIfAbsent(
            @Param("id") UUID id,
            @Param("name") String name,
            @Param("category") String category,
            @Param("building") String building,
            @Param("floor") String floor,
            @Param("locationDescription") String locationDescription,
            @Param("latitude") Double latitude,
            @Param("longitude") Double longitude,
            @Param("active") boolean active);

    @Modifying
    @Query(nativeQuery = true, value = """
                    INSERT INTO supplier_opening_hours (id, supplier_id, day_of_week, opens_at, closes_at)
                    VALUES (gen_random_uuid(), :supplierId, :dayOfWeek, :opensAt, :closesAt)
                    """)
    void insertOpeningHours(
            @Param("supplierId") UUID supplierId,
            @Param("dayOfWeek") short dayOfWeek,
            @Param("opensAt") LocalTime opensAt,
            @Param("closesAt") LocalTime closesAt);
}
