package sg.edu.nus.foc.supplier.supplier;

import java.time.LocalTime;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.function.Predicate;
import java.util.stream.Collectors;

/**
 * Filters, sorts and paginates the (cached) catalogue in memory.
 *
 * <p>The catalogue is small (tens to hundreds of campus locations) and already cached for
 * NFR5.3.2, and Firestore cannot do case-insensitive substring search or distance sorting, so
 * searching the cached list is both simpler and faster than issuing Firestore queries.
 */
public final class CatalogueSearch {

    private CatalogueSearch() {
    }

    public static PageResult<SupplierMatch> search(List<Supplier> catalogue, CatalogueQuery query, LocalTime now) {
        Predicate<Supplier> filter = statusFilter(query.status())
                .and(textFilter(query.text()))
                .and(typeFilter(query.types()))
                .and(buildingFilter(query.building()));

        List<SupplierMatch> matches = catalogue.stream()
                .filter(filter)
                .map(s -> toMatch(s, query, now))
                .filter(m -> !query.openNow() || m.openNow())
                .filter(m -> query.radiusMeters() == null || m.distanceMeters() == null
                        || m.distanceMeters() <= query.radiusMeters())
                .sorted(comparator(query))
                .toList();

        int size = query.size();
        int totalPages = (int) Math.ceil(matches.size() / (double) size);
        int from = Math.min((query.page() - 1) * size, matches.size());
        int to = Math.min(from + size, matches.size());
        return new PageResult<>(matches.subList(from, to), query.page(), size, matches.size(), totalPages);
    }

    private static SupplierMatch toMatch(Supplier supplier, CatalogueQuery query, LocalTime now) {
        SupplierDetails d = supplier.details();
        Double distance = query.near() == null ? null
                : Geo.distanceMeters(query.near().latitude(), query.near().longitude(), d.latitude(), d.longitude());
        return new SupplierMatch(supplier, distance, OpeningHours.isOpen(d.openingTime(), d.closingTime(), now));
    }

    private static Predicate<Supplier> statusFilter(CatalogueQuery.StatusFilter status) {
        return switch (status) {
            case ACTIVE -> Supplier::active;
            case INACTIVE -> s -> !s.active();
            case ALL -> s -> true;
        };
    }

    private static Predicate<Supplier> textFilter(String text) {
        if (text == null || text.isBlank()) {
            return s -> true;
        }
        String needle = NaturalKey.normalise(text);
        return s -> contains(s.details().name(), needle)
                || contains(s.details().building(), needle)
                || contains(s.details().locationDescription(), needle);
    }

    private static Predicate<Supplier> typeFilter(List<String> types) {
        if (types.isEmpty()) {
            return s -> true;
        }
        Set<String> wanted = types.stream().map(t -> t.strip().toLowerCase(Locale.ROOT)).collect(Collectors.toSet());
        return s -> wanted.contains(s.details().type().toLowerCase(Locale.ROOT));
    }

    private static Predicate<Supplier> buildingFilter(String building) {
        if (building == null || building.isBlank()) {
            return s -> true;
        }
        String needle = NaturalKey.normalise(building);
        return s -> contains(s.details().building(), needle);
    }

    private static boolean contains(String haystack, String normalisedNeedle) {
        return haystack != null && NaturalKey.normalise(haystack).contains(normalisedNeedle);
    }

    /** Sorts by the requested field, then name and ID so repeated listings never shuffle (F3.1.3). */
    private static Comparator<SupplierMatch> comparator(CatalogueQuery query) {
        Comparator<SupplierMatch> primary = switch (query.sort()) {
            case NAME -> Comparator.comparing(m -> lower(m.supplier().details().name()));
            case TYPE -> Comparator.comparing(m -> lower(m.supplier().details().type()));
            case BUILDING -> Comparator.comparing(m -> lower(m.supplier().details().building()));
            case DISTANCE -> Comparator.comparing(SupplierMatch::distanceMeters,
                    Comparator.nullsLast(Comparator.naturalOrder()));
            case UPDATED_AT -> Comparator.comparing(m -> m.supplier().updatedAt());
        };
        if (query.direction() == CatalogueQuery.SortDirection.DESC) {
            primary = primary.reversed();
        }
        return primary
                .thenComparing(m -> lower(m.supplier().details().name()))
                .thenComparing(m -> m.supplier().id());
    }

    private static String lower(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT);
    }
}
