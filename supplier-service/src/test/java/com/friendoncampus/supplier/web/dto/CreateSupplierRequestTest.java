package com.friendoncampus.supplier.web.dto;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalTime;
import java.util.Set;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;

import com.friendoncampus.supplier.domain.SupplierStatus;
import com.friendoncampus.supplier.service.CreateSupplierCommand;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;

class CreateSupplierRequestTest {

    private static final ValidatorFactory VALIDATOR_FACTORY =
            Validation.buildDefaultValidatorFactory();
    private static final Validator VALIDATOR = VALIDATOR_FACTORY.getValidator();

    @AfterAll
    static void closeValidatorFactory() {
        VALIDATOR_FACTORY.close();
    }

    @Test
    void trimsTextDefaultsStatusAndMapsToCommand() {
        CreateSupplierRequest request = new CreateSupplierRequest(
                "  New Campus Cafe  ",
                " Food/Coffee ",
                " COM3 ",
                "   ",
                "  Beside the main entrance  ",
                1.2948,
                103.7716,
                LocalTime.of(8, 0),
                null,
                "   ",
                null);

        assertThat(VALIDATOR.validate(request)).isEmpty();
        assertThat(request.name()).isEqualTo("New Campus Cafe");
        assertThat(request.type()).isEqualTo("Food/Coffee");
        assertThat(request.building()).isEqualTo("COM3");
        assertThat(request.floor()).isNull();
        assertThat(request.locationDescription()).isEqualTo("Beside the main entrance");
        assertThat(request.imageUrl()).isNull();
        assertThat(request.status()).isEqualTo(SupplierStatus.ACTIVE);

        CreateSupplierCommand command = request.toCommand();
        assertThat(command.name()).isEqualTo("New Campus Cafe");
        assertThat(command.closingTime()).isNull();
        assertThat(command.status()).isEqualTo(SupplierStatus.ACTIVE);
    }

    @Test
    void acceptsCoordinateBoundariesIndependentTimesAndHttpUrls() {
        CreateSupplierRequest minimum = request(
                "Name", "Type", "Building", "Floor", -90.0, -180.0,
                LocalTime.of(23, 0), null, "http://example.com/image.jpg", SupplierStatus.ACTIVE);
        CreateSupplierRequest maximum = request(
                "Name", "Type", "Building", null, 90.0, 180.0,
                null, LocalTime.of(2, 0), "https://example.com/image.jpg", SupplierStatus.INACTIVE);

        assertThat(VALIDATOR.validate(minimum)).isEmpty();
        assertThat(VALIDATOR.validate(maximum)).isEmpty();
    }

    @Test
    void rejectsMissingBlankAndOverlongRequiredText() {
        assertInvalidField(request(
                null, "Type", "Building", null, 1.0, 1.0,
                null, null, null, null), "name");
        assertInvalidField(request(
                "   ", "Type", "Building", null, 1.0, 1.0,
                null, null, null, null), "name");
        assertInvalidField(request(
                "n".repeat(256), "Type", "Building", null, 1.0, 1.0,
                null, null, null, null), "name");
        assertInvalidField(request(
                "Name", " ", "Building", null, 1.0, 1.0,
                null, null, null, null), "type");
        assertInvalidField(request(
                "Name", "t".repeat(101), "Building", null, 1.0, 1.0,
                null, null, null, null), "type");
        assertInvalidField(request(
                "Name", "Type", null, null, 1.0, 1.0,
                null, null, null, null), "building");
        assertInvalidField(request(
                "Name", "Type", "b".repeat(256), null, 1.0, 1.0,
                null, null, null, null), "building");
    }

    @Test
    void rejectsOverlongFloorMissingCoordinatesAndOutOfRangeCoordinates() {
        assertInvalidField(request(
                "Name", "Type", "Building", "f".repeat(21), 1.0, 1.0,
                null, null, null, null), "floor");
        assertInvalidField(request(
                "Name", "Type", "Building", null, null, 1.0,
                null, null, null, null), "latitude");
        assertInvalidField(request(
                "Name", "Type", "Building", null, 1.0, null,
                null, null, null, null), "longitude");
        assertInvalidField(request(
                "Name", "Type", "Building", null, -90.01, 1.0,
                null, null, null, null), "latitude");
        assertInvalidField(request(
                "Name", "Type", "Building", null, 90.01, 1.0,
                null, null, null, null), "latitude");
        assertInvalidField(request(
                "Name", "Type", "Building", null, 1.0, -180.01,
                null, null, null, null), "longitude");
        assertInvalidField(request(
                "Name", "Type", "Building", null, 1.0, 180.01,
                null, null, null, null), "longitude");
    }

    @Test
    void rejectsNonHttpAndRelativeImageUrls() {
        assertInvalidField(request(
                "Name", "Type", "Building", null, 1.0, 1.0,
                null, null, "ftp://example.com/image.jpg", null), "imageUrl");
        assertInvalidField(request(
                "Name", "Type", "Building", null, 1.0, 1.0,
                null, null, "/images/cafe.jpg", null), "imageUrl");
        assertInvalidField(request(
                "Name", "Type", "Building", null, 1.0, 1.0,
                null, null, "https://not a host/image.jpg", null), "imageUrl");
    }

    private static CreateSupplierRequest request(
            String name,
            String type,
            String building,
            String floor,
            Double latitude,
            Double longitude,
            LocalTime openingTime,
            LocalTime closingTime,
            String imageUrl,
            SupplierStatus status) {
        return new CreateSupplierRequest(
                name,
                type,
                building,
                floor,
                null,
                latitude,
                longitude,
                openingTime,
                closingTime,
                imageUrl,
                status);
    }

    private static void assertInvalidField(CreateSupplierRequest request, String field) {
        Set<ConstraintViolation<CreateSupplierRequest>> violations = VALIDATOR.validate(request);
        assertThat(violations)
                .extracting(violation -> violation.getPropertyPath().toString())
                .contains(field);
    }
}
