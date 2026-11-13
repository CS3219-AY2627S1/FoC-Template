package com.friendoncampus.supplier.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.data.domain.Sort;

import com.friendoncampus.supplier.domain.SupplierStatus;

class AdminSupplierQueryTest {

    @Test
    void defaultsToEveryStatusAndPublicQueryDefaults() {
        AdminSupplierQuery query = AdminSupplierQuery.from(
                null, null, null, null, null, null, null);

        assertThat(query.status()).isNull();
        assertThat(query.supplierQuery().page()).isZero();
        assertThat(query.supplierQuery().size()).isEqualTo(20);
        assertThat(query.supplierQuery().sortField()).isEqualTo("name");
        assertThat(query.supplierQuery().sortDirection()).isEqualTo(Sort.Direction.ASC);
    }

    @Test
    void parsesStatusCaseInsensitivelyAndTrimsSharedFilters() {
        AdminSupplierQuery query = AdminSupplierQuery.from(
                " coffee ", " Food ", " Central Library ", " inactive ",
                "1", "10", "updatedAt,desc");

        assertThat(query.status()).isEqualTo(SupplierStatus.INACTIVE);
        assertThat(query.supplierQuery().search()).isEqualTo("coffee");
        assertThat(query.supplierQuery().type()).isEqualTo("Food");
        assertThat(query.supplierQuery().building()).isEqualTo("Central Library");
        assertThat(query.supplierQuery().page()).isEqualTo(1);
        assertThat(query.supplierQuery().size()).isEqualTo(10);
        assertThat(query.supplierQuery().sortField()).isEqualTo("updatedAt");
        assertThat(query.supplierQuery().sortDirection()).isEqualTo(Sort.Direction.DESC);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "\t"})
    void treatsBlankStatusAsAbsent(String status) {
        AdminSupplierQuery query = AdminSupplierQuery.from(
                null, null, null, status, null, null, null);

        assertThat(query.status()).isNull();
    }

    @Test
    void supportsAdministrativeStatusSorting() {
        AdminSupplierQuery query = AdminSupplierQuery.from(
                null, null, null, null, "2", "5", "status,desc");

        Sort.Order order = query.supplierQuery().toPageRequest()
                .getSort()
                .getOrderFor("status");
        assertThat(order).isNotNull();
        assertThat(order.getDirection()).isEqualTo(Sort.Direction.DESC);
        assertThat(order.isIgnoreCase()).isFalse();
        assertThat(order.getNullHandling()).isEqualTo(Sort.NullHandling.NULLS_LAST);
    }

    @ParameterizedTest
    @ValueSource(strings = {"DELETED", "ACTIVE,INACTIVE", "1"})
    void rejectsUnsupportedStatus(String status) {
        assertThatThrownBy(() -> AdminSupplierQuery.from(
                null, null, null, status, null, null, null))
                .isInstanceOf(InvalidSupplierQueryException.class)
                .hasMessageContaining("Use ACTIVE or INACTIVE");
    }

    @ParameterizedTest
    @ValueSource(strings = {"page=-1", "size=101", "sort=id,asc", "sort=status,sideways"})
    void reusesSharedQueryValidation(String queryPart) {
        String[] parts = queryPart.split("=", 2);
        String page = parts[0].equals("page") ? parts[1] : null;
        String size = parts[0].equals("size") ? parts[1] : null;
        String sort = parts[0].equals("sort") ? parts[1] : null;

        assertThatThrownBy(() -> AdminSupplierQuery.from(
                null, null, null, null, page, size, sort))
                .isInstanceOf(InvalidSupplierQueryException.class);
    }
}
