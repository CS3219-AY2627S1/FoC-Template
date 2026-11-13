package com.friendoncampus.supplier.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class DeleteSupplierCommandTest {

    @Test
    void parsesRequiredNonnegativeWholeNumber() {
        assertThat(DeleteSupplierCommand.from(" 2 ").version()).isEqualTo(2L);
        assertThat(DeleteSupplierCommand.from("0").version()).isZero();
    }

    @Test
    void rejectsMissingVersion() {
        assertThatThrownBy(() -> DeleteSupplierCommand.from(null))
                .isInstanceOf(InvalidSupplierQueryException.class)
                .hasMessage("version query parameter is required");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "-1", "1.5", "one", "9223372036854775808"})
    void rejectsInvalidVersion(String version) {
        assertThatThrownBy(() -> DeleteSupplierCommand.from(version))
                .isInstanceOf(InvalidSupplierQueryException.class)
                .hasMessage("version must be a nonnegative whole number");
    }
}
