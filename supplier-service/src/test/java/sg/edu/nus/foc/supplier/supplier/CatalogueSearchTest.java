package sg.edu.nus.foc.supplier.supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static sg.edu.nus.foc.supplier.support.Suppliers.details;
import static sg.edu.nus.foc.supplier.support.Suppliers.supplier;

import java.time.LocalTime;
import java.util.List;

import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.supplier.supplier.CatalogueQuery.Coordinates;
import sg.edu.nus.foc.supplier.supplier.CatalogueQuery.SortDirection;
import sg.edu.nus.foc.supplier.supplier.CatalogueQuery.SortField;
import sg.edu.nus.foc.supplier.supplier.CatalogueQuery.StatusFilter;

class CatalogueSearchTest {

    private static final LocalTime NOON = LocalTime.NOON;

    private final List<Supplier> catalogue = List.of(
            supplier("a", details("Cool Spot", "Food", "Com2", 1.2940, 103.7738, LocalTime.of(9, 0), LocalTime.of(21, 30)), true),
            supplier("b", details("Printer @ Com 2", "Printing", "Com 2", 1.2938, 103.7744, LocalTime.of(0, 0), LocalTime.of(23, 59)), true),
            supplier("c", details("TOMORO COFFEE", "Food/Coffee", "Hon Sui Sen Memorial Library", 1.2931, 103.7719, LocalTime.of(8, 15), LocalTime.of(18, 0)), true),
            supplier("d", details("Supersnacks", "Food", "Prince George's Park", 1.2913, 103.7776, LocalTime.of(11, 0), LocalTime.of(2, 0)), true),
            supplier("e", details("Closed Kiosk", "Food", "Com2", 1.2940, 103.7738, LocalTime.of(13, 0), LocalTime.of(14, 0)), false));

    private static CatalogueQuery query(String text, List<String> types, String building, boolean openNow,
                                        Coordinates near, Double radius, StatusFilter status, SortField sort,
                                        SortDirection direction, int page, int size) {
        return new CatalogueQuery(text, types, building, openNow, near, radius, status, sort, direction, page, size);
    }

    private static CatalogueQuery all() {
        return query(null, null, null, false, null, null, null, null, null, 1, 50);
    }

    private static List<String> ids(PageResult<SupplierMatch> page) {
        return page.items().stream().map(m -> m.supplier().id()).toList();
    }

    @Test
    void defaultListingHasOnlyActiveSuppliersSortedByName() {
        assertThat(ids(CatalogueSearch.search(catalogue, all(), NOON))).containsExactly("a", "b", "d", "c");
    }

    @Test
    void textSearchIsPartialAndCaseInsensitiveOverNameAndBuilding() {
        var byName = query("coffee", null, null, false, null, null, null, null, null, 1, 50);
        var byBuilding = query("GEORGE", null, null, false, null, null, null, null, null, 1, 50);
        assertThat(ids(CatalogueSearch.search(catalogue, byName, NOON))).containsExactly("c");
        assertThat(ids(CatalogueSearch.search(catalogue, byBuilding, NOON))).containsExactly("d");
    }

    @Test
    void typeFilterIsExactAndCaseInsensitiveWithMultipleValues() {
        var q = query(null, List.of("printing", " FOOD/coffee "), null, false, null, null, null, null, null, 1, 50);
        assertThat(ids(CatalogueSearch.search(catalogue, q, NOON))).containsExactly("b", "c");
    }

    @Test
    void buildingFilterIsPartial() {
        var q = query(null, null, "com", false, null, null, null, null, null, 1, 50);
        assertThat(ids(CatalogueSearch.search(catalogue, q, NOON))).containsExactly("a", "b");
    }

    @Test
    void statusFiltersForAdmins() {
        var inactive = query(null, null, null, false, null, null, StatusFilter.INACTIVE, null, null, 1, 50);
        var everything = query(null, null, null, false, null, null, StatusFilter.ALL, null, null, 1, 50);
        assertThat(ids(CatalogueSearch.search(catalogue, inactive, NOON))).containsExactly("e");
        assertThat(CatalogueSearch.search(catalogue, everything, NOON).totalItems()).isEqualTo(5);
    }

    @Test
    void openNowUsesTheGivenTime() {
        var q = query(null, null, null, true, null, null, null, null, null, 1, 50);
        assertThat(ids(CatalogueSearch.search(catalogue, q, LocalTime.of(1, 0)))).containsExactly("b", "d");
    }

    @Test
    void nearSortsByDistanceAndRadiusFilters() {
        Coordinates com2 = new Coordinates(1.2939, 103.7741);
        var sorted = query(null, null, null, false, com2, null, null, null, null, 1, 50);
        PageResult<SupplierMatch> result = CatalogueSearch.search(catalogue, sorted, NOON);
        assertThat(ids(result).getFirst()).isIn("a", "b");
        assertThat(result.items()).allSatisfy(m -> assertThat(m.distanceMeters()).isNotNull());

        var within = query(null, null, null, false, com2, 200.0, null, null, null, 1, 50);
        assertThat(ids(CatalogueSearch.search(catalogue, within, NOON))).containsExactlyInAnyOrder("a", "b");
    }

    @Test
    void sortsByTypeBuildingAndUpdatedDescendingWithStableTieBreak() {
        var byTypeDesc = query(null, null, null, false, null, null, null, SortField.TYPE, SortDirection.DESC, 1, 50);
        assertThat(ids(CatalogueSearch.search(catalogue, byTypeDesc, NOON))).containsExactly("b", "c", "a", "d");
        var byBuilding = query(null, null, null, false, null, null, null, SortField.BUILDING, null, 1, 50);
        assertThat(ids(CatalogueSearch.search(catalogue, byBuilding, NOON))).containsExactly("b", "a", "c", "d");
        var byUpdated = query(null, null, null, false, null, null, null, SortField.UPDATED_AT, null, 1, 50);
        assertThat(ids(CatalogueSearch.search(catalogue, byUpdated, NOON))).containsExactly("a", "b", "d", "c");
    }

    @Test
    void distanceSortWithoutPointKeepsEveryone() {
        var q = query(null, null, null, false, null, null, null, SortField.DISTANCE, null, 1, 50);
        assertThat(CatalogueSearch.search(catalogue, q, NOON).totalItems()).isEqualTo(4);
    }

    @Test
    void paginatesAndReportsTotals() {
        var page2 = query(null, null, null, false, null, null, null, null, null, 2, 3);
        PageResult<SupplierMatch> result = CatalogueSearch.search(catalogue, page2, NOON);
        assertThat(ids(result)).containsExactly("c");
        assertThat(result.totalItems()).isEqualTo(4);
        assertThat(result.totalPages()).isEqualTo(2);

        var beyond = query(null, null, null, false, null, null, null, null, null, 9, 3);
        assertThat(CatalogueSearch.search(catalogue, beyond, NOON).items()).isEmpty();
    }

    @Test
    void noMatchIsAnEmptyPageNotAnError() {
        var q = query("zzz", null, null, false, null, null, null, null, null, 1, 10);
        PageResult<SupplierMatch> result = CatalogueSearch.search(catalogue, q, NOON);
        assertThat(result.items()).isEmpty();
        assertThat(result.totalPages()).isZero();
    }
}
