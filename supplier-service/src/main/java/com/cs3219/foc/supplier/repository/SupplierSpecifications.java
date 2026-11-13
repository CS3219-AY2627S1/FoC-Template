package com.cs3219.foc.supplier.repository;

import com.cs3219.foc.supplier.model.entity.Supplier;
import com.cs3219.foc.supplier.model.entity.SupplierCategory;
import com.cs3219.foc.supplier.model.entity.SupplierOpeningHours;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Expression;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Collection;
import java.util.Locale;
import org.springframework.data.jpa.domain.Specification;

/** Composable filters for {@link SupplierRepository#findAll(Specification, org.springframework.data.domain.Sort)}. */
public final class SupplierSpecifications {
    // Escape character for LIKE, so wildcards the user types (% and _) are matched as plain text.
    private static final char LIKE_ESCAPE_CHAR = '\\';

    private SupplierSpecifications() {}

    public static Specification<Supplier> isActive() {
        return (root, query, cb) -> cb.isTrue(root.get("active"));
    }

    /**
     * Case-insensitive substring matches name, building, location description. Spaces are ignored on both sides,
     * so "com 2" will be find "COM2"
     */
    public static Specification<Supplier> matchesText(String text) {
        var pattern = "%" + escapeLike(text.toLowerCase(Locale.ROOT).replaceAll("\\s+", "")) + "%";
        return (root, query, cb) -> cb.or(
                cb.like(withoutSpaces(cb, root.get("name")), pattern, LIKE_ESCAPE_CHAR),
                cb.like(withoutSpaces(cb, root.get("building")), pattern, LIKE_ESCAPE_CHAR),
                cb.like(withoutSpaces(cb, root.get("locationDescription")), pattern, LIKE_ESCAPE_CHAR));
    }

    public static Specification<Supplier> inCategories(Collection<SupplierCategory> categories) {
        return (root, query, cb) -> root.get("category").in(categories);
    }

    /**
     * Suppliers open on {@code day} at {@code time}. Opening time is inclusive and closing time is exclusive.
     * The catalog convention {@code 00:00–23:59} represents the full day, including its final minute.
     */
    public static Specification<Supplier> openAt(DayOfWeek day, LocalTime time) {
        return (root, query, cb) -> {
            var subquery = query.subquery(Integer.class);
            var hours = subquery.from(SupplierOpeningHours.class);
            var opensAt = hours.<LocalTime>get("opensAt");
            var closesAt = hours.<LocalTime>get("closesAt");
            var dayOfWeek = hours.<DayOfWeek>get("dayOfWeek");

            var fullDay = cb.and(cb.equal(opensAt, LocalTime.MIDNIGHT), cb.equal(closesAt, LocalTime.of(23, 59)));
            var openToday = cb.and(
                    cb.equal(dayOfWeek, day),
                    cb.lessThanOrEqualTo(opensAt, time),
                    cb.or(fullDay, cb.greaterThan(closesAt, time), cb.lessThan(closesAt, opensAt)));
            var openSinceYesterday = cb.and(
                    cb.equal(dayOfWeek, day.minus(1)), cb.lessThan(closesAt, opensAt), cb.greaterThan(closesAt, time));

            subquery.select(cb.literal(1))
                    .where(cb.equal(hours.get("supplier"), root), cb.or(openToday, openSinceYesterday));
            return cb.exists(subquery);
        };
    }

    private static Expression<String> withoutSpaces(CriteriaBuilder cb, Expression<String> field) {
        return cb.lower(cb.function("replace", String.class, field, cb.literal(" "), cb.literal("")));
    }

    private static String escapeLike(String text) {
        return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
