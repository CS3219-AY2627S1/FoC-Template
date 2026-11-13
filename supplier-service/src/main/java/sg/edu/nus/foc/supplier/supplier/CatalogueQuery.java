package sg.edu.nus.foc.supplier.supplier;

import java.util.List;

/**
 * A validated catalogue search.
 *
 * @param text         case-insensitive partial match on name, building or location description (F4.1)
 * @param types        exact (case-insensitive) type filter; empty = any (F4.2)
 * @param building     case-insensitive partial building match (F4.3)
 * @param openNow      only suppliers open at the time of the request
 * @param near         reference point for distance sorting / radius filtering; may be null
 * @param radiusMeters only suppliers within this distance of {@code near}; may be null
 * @param page         1-based
 */
public record CatalogueQuery(
        String text,
        List<String> types,
        String building,
        boolean openNow,
        Coordinates near,
        Double radiusMeters,
        StatusFilter status,
        SortField sort,
        SortDirection direction,
        int page,
        int size) {

    public static final int DEFAULT_PAGE_SIZE = 12;
    public static final int MAX_PAGE_SIZE = 100;

    public CatalogueQuery {
        types = types != null ? List.copyOf(types) : List.of();
        status = status != null ? status : StatusFilter.ACTIVE;
        sort = sort != null ? sort : (near != null ? SortField.DISTANCE : SortField.NAME);
        direction = direction != null ? direction : SortDirection.ASC;
    }

    public record Coordinates(double latitude, double longitude) {
    }

    /** F3.1.1: listings show active suppliers unless an administrator asks otherwise. */
    public enum StatusFilter { ACTIVE, INACTIVE, ALL }

    public enum SortField { NAME, TYPE, BUILDING, DISTANCE, UPDATED_AT }

    public enum SortDirection { ASC, DESC }
}
