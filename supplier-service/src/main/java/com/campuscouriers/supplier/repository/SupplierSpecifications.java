/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-26 to 2026-09-28
 * Scope: Generated initial Supplier Service implementation and tests.
 */

package com.campuscouriers.supplier.repository;
import com.campuscouriers.supplier.entity.Supplier;
import com.campuscouriers.supplier.entity.SupplierStatus;
import com.campuscouriers.supplier.util.NameNormalizer;
import org.springframework.data.jpa.domain.Specification;

import java.util.UUID;

public final class SupplierSpecifications {

    private SupplierSpecifications() {
    }

    public static Specification<Supplier> hasStatus(SupplierStatus status) {
        return (root, query, builder) -> builder.equal(root.get("status"), status);
    }

    public static Specification<Supplier> nameContains(String query) {
        if (query == null || query.isBlank()) {
            return (root, criteriaQuery, builder) -> builder.conjunction();
        }
        String normalized = NameNormalizer.normalizedName(query);
        String escaped = normalized
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
        return (root, criteriaQuery, builder) ->
                builder.like(root.get("normalizedName"), "%" + escaped + "%", '\\');
    }

    public static Specification<Supplier> hasCategory(UUID categoryId) {
        if (categoryId == null) {
            return (root, query, builder) -> builder.conjunction();
        }
        return (root, query, builder) ->
                builder.equal(root.get("category").get("id"), categoryId);
    }

    public static Specification<Supplier> hasBuilding(UUID buildingId) {
        if (buildingId == null) {
            return (root, query, builder) -> builder.conjunction();
        }
        return (root, query, builder) ->
                builder.equal(root.get("building").get("id"), buildingId);
    }
}
