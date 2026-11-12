/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-26 to 2026-11-10
 * Scope: Generated building persistence queries for creation, listing, and administration.
 */
package com.campuscouriers.supplier.repository;

import com.campuscouriers.supplier.entity.Building;
import com.campuscouriers.supplier.entity.BuildingStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.List;
import java.util.UUID;

public interface BuildingRepository extends JpaRepository<Building, UUID> {

    boolean existsByNormalizedName(String normalizedName);

    boolean existsByNormalizedNameAndIdNot(String normalizedName, UUID id);

    Optional<Building> findByNormalizedName(String normalizedName);

    List<Building> findAllByStatusOrderByNormalizedNameAsc(BuildingStatus status);
}
