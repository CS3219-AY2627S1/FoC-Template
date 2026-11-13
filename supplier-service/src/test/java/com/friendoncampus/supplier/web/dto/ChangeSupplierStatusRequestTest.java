package com.friendoncampus.supplier.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;

import com.friendoncampus.supplier.domain.SupplierStatus;
import com.friendoncampus.supplier.service.ChangeSupplierStatusCommand;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;

class ChangeSupplierStatusRequestTest {

    private static final ValidatorFactory VALIDATOR_FACTORY =
            Validation.buildDefaultValidatorFactory();
    private static final Validator VALIDATOR = VALIDATOR_FACTORY.getValidator();

    @AfterAll
    static void closeValidatorFactory() {
        VALIDATOR_FACTORY.close();
    }

    @Test
    void mapsValidRequestToCommand() {
        ChangeSupplierStatusRequest request =
                new ChangeSupplierStatusRequest(SupplierStatus.INACTIVE, 3L);

        assertThat(VALIDATOR.validate(request)).isEmpty();
        assertThat(request.toCommand()).isEqualTo(
                new ChangeSupplierStatusCommand(SupplierStatus.INACTIVE, 3L));
    }

    @Test
    void acceptsZeroVersion() {
        ChangeSupplierStatusRequest request =
                new ChangeSupplierStatusRequest(SupplierStatus.ACTIVE, 0L);

        assertThat(VALIDATOR.validate(request)).isEmpty();
    }

    @Test
    void rejectsMissingStatusAndInvalidVersion() {
        ChangeSupplierStatusRequest request = new ChangeSupplierStatusRequest(null, -1L);

        Set<ConstraintViolation<ChangeSupplierStatusRequest>> violations =
                VALIDATOR.validate(request);
        assertThat(violations)
                .extracting(violation -> violation.getPropertyPath().toString())
                .containsExactlyInAnyOrder("status", "version");
    }

    @Test
    void rejectsMissingVersion() {
        ChangeSupplierStatusRequest request =
                new ChangeSupplierStatusRequest(SupplierStatus.ACTIVE, null);

        assertThat(VALIDATOR.validate(request))
                .extracting(violation -> violation.getPropertyPath().toString())
                .containsExactly("version");
    }
}
