package com.friendoncampus.supplier.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalTime;
import java.util.Set;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;

import com.friendoncampus.supplier.service.UpdateSupplierCommand;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;

class UpdateSupplierRequestTest {

    private static final ValidatorFactory VALIDATOR_FACTORY =
            Validation.buildDefaultValidatorFactory();
    private static final Validator VALIDATOR = VALIDATOR_FACTORY.getValidator();

    @AfterAll
    static void closeValidatorFactory() {
        VALIDATOR_FACTORY.close();
    }

    @Test
    void trimsAndMapsFullUpdateToCommand() {
        UpdateSupplierRequest request = request(
                " Updated Campus Cafe ",
                " Food/Coffee ",
                " COM3 ",
                "  ",
                "  Now beside the lift  ",
                1.2948,
                103.7716,
                LocalTime.of(9, 0),
                null,
                "  ",
                3L);

        assertThat(VALIDATOR.validate(request)).isEmpty();
        assertThat(request.name()).isEqualTo("Updated Campus Cafe");
        assertThat(request.type()).isEqualTo("Food/Coffee");
        assertThat(request.building()).isEqualTo("COM3");
        assertThat(request.floor()).isNull();
        assertThat(request.locationDescription()).isEqualTo("Now beside the lift");
        assertThat(request.imageUrl()).isNull();

        UpdateSupplierCommand command = request.toCommand();
        assertThat(command.name()).isEqualTo("Updated Campus Cafe");
        assertThat(command.closingTime()).isNull();
        assertThat(command.version()).isEqualTo(3L);
    }

    @Test
    void acceptsCoordinateBoundariesIndependentTimesAndZeroVersion() {
        UpdateSupplierRequest minimum = request(
                "Name", "Type", "Building", null, null, -90.0, -180.0,
                LocalTime.of(23, 0), null, "http://example.com/image.jpg", 0L);
        UpdateSupplierRequest maximum = request(
                "Name", "Type", "Building", "B1", null, 90.0, 180.0,
                null, LocalTime.of(2, 0), "https://example.com/image.jpg", 4L);

        assertThat(VALIDATOR.validate(minimum)).isEmpty();
        assertThat(VALIDATOR.validate(maximum)).isEmpty();
    }

    @Test
    void rejectsInvalidRequiredTextAndFloorLength() {
        assertInvalidField(request(
                " ", "Type", "Building", null, null, 1.0, 1.0,
                null, null, null, 0L), "name");
        assertInvalidField(request(
                "n".repeat(256), "Type", "Building", null, null, 1.0, 1.0,
                null, null, null, 0L), "name");
        assertInvalidField(request(
                "Name", " ", "Building", null, null, 1.0, 1.0,
                null, null, null, 0L), "type");
        assertInvalidField(request(
                "Name", "t".repeat(101), "Building", null, null, 1.0, 1.0,
                null, null, null, 0L), "type");
        assertInvalidField(request(
                "Name", "Type", null, null, null, 1.0, 1.0,
                null, null, null, 0L), "building");
        assertInvalidField(request(
                "Name", "Type", "b".repeat(256), null, null, 1.0, 1.0,
                null, null, null, 0L), "building");
        assertInvalidField(request(
                "Name", "Type", "Building", "f".repeat(21), null, 1.0, 1.0,
                null, null, null, 0L), "floor");
    }

    @Test
    void rejectsInvalidCoordinatesUrlAndVersion() {
        assertInvalidField(request(
                "Name", "Type", "Building", null, null, null, 1.0,
                null, null, null, 0L), "latitude");
        assertInvalidField(request(
                "Name", "Type", "Building", null, null, 1.0, null,
                null, null, null, 0L), "longitude");
        assertInvalidField(request(
                "Name", "Type", "Building", null, null, 90.01, 1.0,
                null, null, null, 0L), "latitude");
        assertInvalidField(request(
                "Name", "Type", "Building", null, null, 1.0, -180.01,
                null, null, null, 0L), "longitude");
        assertInvalidField(request(
                "Name", "Type", "Building", null, null, 1.0, 1.0,
                null, null, "ftp://example.com/image.jpg", 0L), "imageUrl");
        assertInvalidField(request(
                "Name", "Type", "Building", null, null, 1.0, 1.0,
                null, null, null, null), "version");
        assertInvalidField(request(
                "Name", "Type", "Building", null, null, 1.0, 1.0,
                null, null, null, -1L), "version");
    }

    private static UpdateSupplierRequest request(
            String name,
            String type,
            String building,
            String floor,
            String locationDescription,
            Double latitude,
            Double longitude,
            LocalTime openingTime,
            LocalTime closingTime,
            String imageUrl,
            Long version) {
        return new UpdateSupplierRequest(
                name,
                type,
                building,
                floor,
                locationDescription,
                latitude,
                longitude,
                openingTime,
                closingTime,
                imageUrl,
                version);
    }

    private static void assertInvalidField(UpdateSupplierRequest request, String field) {
        Set<ConstraintViolation<UpdateSupplierRequest>> violations = VALIDATOR.validate(request);
        assertThat(violations)
                .extracting(violation -> violation.getPropertyPath().toString())
                .contains(field);
    }
}
