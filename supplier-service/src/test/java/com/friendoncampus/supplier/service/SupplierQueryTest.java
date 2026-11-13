package com.friendoncampus.supplier.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

class SupplierQueryTest {

    @Test
    void appliesDefaults() {
        SupplierQuery query = SupplierQuery.from(null, null, null, null, null, null);

        assertThat(query.search()).isNull();
        assertThat(query.type()).isNull();
        assertThat(query.building()).isNull();
        assertThat(query.page()).isZero();
        assertThat(query.size()).isEqualTo(20);
        assertThat(query.sortField()).isEqualTo("name");
        assertThat(query.sortDirection()).isEqualTo(Sort.Direction.ASC);
    }

    @Test
    void trimsFiltersAndTreatsBlankFiltersAsAbsent() {
        SupplierQuery query = SupplierQuery.from(
                "  coffee  ", "   ", " Central Library ", null, null, null);

        assertThat(query.search()).isEqualTo("coffee");
        assertThat(query.type()).isNull();
        assertThat(query.building()).isEqualTo("Central Library");
    }

    @Test
    void buildsCaseInsensitiveNullableLastSortForStrings() {
        SupplierQuery query = SupplierQuery.from(null, null, null, "2", "10", "building,desc");

        PageRequest pageRequest = query.toPageRequest();

        assertThat(pageRequest.getPageNumber()).isEqualTo(2);
        assertThat(pageRequest.getPageSize()).isEqualTo(10);
        Sort.Order order = pageRequest.getSort().getOrderFor("building");
        assertThat(order).isNotNull();
        assertThat(order.getDirection()).isEqualTo(Sort.Direction.DESC);
        assertThat(order.isIgnoreCase()).isTrue();
        assertThat(order.getNullHandling()).isEqualTo(Sort.NullHandling.NULLS_LAST);
    }

    @Test
    void keepsNonStringSortCaseSensitiveAndNullableLast() {
        SupplierQuery query = SupplierQuery.from(null, null, null, null, null, "openingTime,asc");

        Sort.Order order = query.toPageRequest().getSort().getOrderFor("openingTime");

        assertThat(order).isNotNull();
        assertThat(order.isIgnoreCase()).isFalse();
        assertThat(order.getNullHandling()).isEqualTo(Sort.NullHandling.NULLS_LAST);
    }

    @ParameterizedTest
    @ValueSource(strings = {"-1", "one", "", "2147483648"})
    void rejectsInvalidPages(String page) {
        assertInvalidQuery(null, null, null, page, null, null);
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "101", "many", "", "2147483648"})
    void rejectsInvalidSizes(String size) {
        assertInvalidQuery(null, null, null, null, size, null);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "", "name", "name,asc,extra", "id,asc", "status,asc", "name,sideways", ",asc", "name,"
    })
    void rejectsInvalidSorts(String sort) {
        assertInvalidQuery(null, null, null, null, null, sort);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "name", "type", "building", "openingTime", "closingTime", "createdAt", "updatedAt"
    })
    void acceptsEveryDocumentedSortField(String sortField) {
        SupplierQuery query = SupplierQuery.from(
                null, null, null, null, null, sortField + ",desc");

        assertThat(query.sortField()).isEqualTo(sortField);
        assertThat(query.sortDirection()).isEqualTo(Sort.Direction.DESC);
    }

    private void assertInvalidQuery(
            String search,
            String type,
            String building,
            String page,
            String size,
            String sort) {
        assertThatThrownBy(() -> SupplierQuery.from(search, type, building, page, size, sort))
                .isInstanceOf(InvalidSupplierQueryException.class);
    }
}
