package com.friendoncampus.supplier.repository;

import java.util.Locale;

import org.springframework.data.jpa.domain.Specification;

import com.friendoncampus.supplier.domain.Supplier;
import com.friendoncampus.supplier.domain.SupplierStatus;

public final class SupplierSpecifications {

    private static final char LIKE_ESCAPE_CHARACTER = '\\';

    private SupplierSpecifications() {
    }

    public static Specification<Supplier> isActive() {
        return hasStatus(SupplierStatus.ACTIVE);
    }

    public static Specification<Supplier> hasStatus(SupplierStatus status) {
        return (root, query, criteriaBuilder) ->
                criteriaBuilder.equal(root.get("status"), status);
    }

    public static Specification<Supplier> matchesSearch(String search) {
        String pattern = "%" + escapeLike(search.toLowerCase(Locale.ROOT)) + "%";

        return (root, query, criteriaBuilder) -> criteriaBuilder.or(
                criteriaBuilder.like(
                        criteriaBuilder.lower(root.get("name")),
                        pattern,
                        LIKE_ESCAPE_CHARACTER),
                criteriaBuilder.like(
                        criteriaBuilder.lower(root.get("building")),
                        pattern,
                        LIKE_ESCAPE_CHARACTER),
                criteriaBuilder.like(
                        criteriaBuilder.lower(root.get("locationDescription")),
                        pattern,
                        LIKE_ESCAPE_CHARACTER));
    }

    public static Specification<Supplier> hasType(String type) {
        String normalizedType = type.toLowerCase(Locale.ROOT);
        return (root, query, criteriaBuilder) ->
                criteriaBuilder.equal(criteriaBuilder.lower(root.get("type")), normalizedType);
    }

    public static Specification<Supplier> isInBuilding(String building) {
        String normalizedBuilding = building.toLowerCase(Locale.ROOT);
        return (root, query, criteriaBuilder) -> criteriaBuilder.equal(
                criteriaBuilder.lower(root.get("building")),
                normalizedBuilding);
    }

    static String escapeLike(String value) {
        return value
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
    }
}
