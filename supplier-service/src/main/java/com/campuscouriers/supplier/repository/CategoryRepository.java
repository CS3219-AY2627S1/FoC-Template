/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-26 to 2026-11-10
 * Scope: Generated category persistence queries for creation, listing, and administration.
 */
package com.campuscouriers.supplier.repository;

import com.campuscouriers.supplier.entity.Category;
import com.campuscouriers.supplier.entity.CategoryStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.List;
import java.util.UUID;

public interface CategoryRepository extends JpaRepository<Category, UUID> {

    boolean existsByNormalizedName(String normalizedName);

    boolean existsByNormalizedNameAndIdNot(String normalizedName, UUID id);

    Optional<Category> findByNormalizedName(String normalizedName);

    List<Category> findAllByStatusOrderByNormalizedNameAsc(CategoryStatus status);
}
