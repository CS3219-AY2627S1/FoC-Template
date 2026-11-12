/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-26 to 2026-11-10
 * Scope: Generated supplier persistence, duplicate, retrieval, and administration queries.
 */
package com.campuscouriers.supplier.repository;

import com.campuscouriers.supplier.entity.Supplier;
import com.campuscouriers.supplier.entity.SupplierStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;

import java.util.UUID;
import java.util.Optional;

public interface SupplierRepository extends JpaRepository<Supplier, UUID>, JpaSpecificationExecutor<Supplier> {

    boolean existsByNormalizedNameAndBuildingId(String normalizedName, UUID buildingId);

    boolean existsByNormalizedNameAndBuildingIdAndIdNot(
            String normalizedName, UUID buildingId, UUID id);

    boolean existsByCategoryIdAndStatus(UUID categoryId, SupplierStatus status);

    boolean existsByBuildingIdAndStatus(UUID buildingId, SupplierStatus status);

    @EntityGraph(attributePaths = {"category", "building"})
    Optional<Supplier> findByIdAndStatus(UUID id, SupplierStatus status);

    @Override
    @EntityGraph(attributePaths = {"category", "building"})
    Page<Supplier> findAll(Specification<Supplier> specification, Pageable pageable);
}
