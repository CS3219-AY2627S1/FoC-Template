package com.friendoncampus.supplier.repository;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SupplierSpecificationsTest {

    @Test
    void escapesSqlLikeWildcardsAndEscapeCharacters() {
        assertThat(SupplierSpecifications.escapeLike("100%_coffee\\shop"))
                .isEqualTo("100\\%\\_coffee\\\\shop");
    }
}
