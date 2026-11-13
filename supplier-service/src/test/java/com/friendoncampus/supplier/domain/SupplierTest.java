package com.friendoncampus.supplier.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;

class SupplierTest {

    @Test
    void createsSupplierWithInitialVersionAndLifecycleTimestamps() {
        Supplier supplier = Supplier.create(
                "New Campus Cafe",
                "Food/Coffee",
                "COM3",
                null,
                null,
                1.2948,
                103.7716,
                LocalTime.of(8, 0),
                null,
                null,
                SupplierStatus.ACTIVE);

        assertThat(supplier.getVersion()).isZero();
        assertThat(supplier.getCreatedAt()).isNull();
        assertThat(supplier.getUpdatedAt()).isNull();

        supplier.prepareForCreate();

        assertThat(supplier.getCreatedAt()).isNotNull();
        assertThat(supplier.getUpdatedAt()).isEqualTo(supplier.getCreatedAt());
        assertThat(supplier.getCreatedAt().getOffset()).isEqualTo(ZoneOffset.UTC);

        OffsetDateTime createdAt = supplier.getCreatedAt();
        supplier.prepareForUpdate();

        assertThat(supplier.getCreatedAt()).isEqualTo(createdAt);
        assertThat(supplier.getUpdatedAt()).isAfterOrEqualTo(createdAt);
    }

    @Test
    void updatesOnlyEditableDetails() {
        Supplier supplier = Supplier.create(
                "Original Cafe",
                "Food",
                "COM2",
                "1",
                "Original location",
                1.0,
                2.0,
                LocalTime.of(8, 0),
                LocalTime.of(17, 0),
                "https://example.com/original.jpg",
                SupplierStatus.INACTIVE);
        supplier.prepareForCreate();
        OffsetDateTime createdAt = supplier.getCreatedAt();

        supplier.updateDetails(
                "Updated Cafe",
                "Food/Coffee",
                "COM3",
                null,
                null,
                3.0,
                4.0,
                null,
                LocalTime.of(2, 0),
                null);

        assertThat(supplier.getName()).isEqualTo("Updated Cafe");
        assertThat(supplier.getType()).isEqualTo("Food/Coffee");
        assertThat(supplier.getBuilding()).isEqualTo("COM3");
        assertThat(supplier.getFloor()).isNull();
        assertThat(supplier.getLocationDescription()).isNull();
        assertThat(supplier.getLatitude()).isEqualTo(3.0);
        assertThat(supplier.getLongitude()).isEqualTo(4.0);
        assertThat(supplier.getOpeningTime()).isNull();
        assertThat(supplier.getClosingTime()).isEqualTo(LocalTime.of(2, 0));
        assertThat(supplier.getImageUrl()).isNull();
        assertThat(supplier.getStatus()).isEqualTo(SupplierStatus.INACTIVE);
        assertThat(supplier.getVersion()).isZero();
        assertThat(supplier.getCreatedAt()).isEqualTo(createdAt);
    }

    @Test
    void leavesManagedFieldsUnchangedWhenDetailsAreIdentical() {
        Supplier supplier = Supplier.create(
                "Campus Cafe",
                "Food/Coffee",
                "COM3",
                "1",
                "Beside the entrance",
                1.2948,
                103.7716,
                LocalTime.of(8, 0),
                LocalTime.of(18, 0),
                "https://example.com/cafe.jpg",
                SupplierStatus.ACTIVE);
        supplier.prepareForCreate();
        OffsetDateTime createdAt = supplier.getCreatedAt();
        OffsetDateTime updatedAt = supplier.getUpdatedAt();

        supplier.updateDetails(
                "Campus Cafe",
                "Food/Coffee",
                "COM3",
                "1",
                "Beside the entrance",
                1.2948,
                103.7716,
                LocalTime.of(8, 0),
                LocalTime.of(18, 0),
                "https://example.com/cafe.jpg");

        assertThat(supplier.getVersion()).isZero();
        assertThat(supplier.getCreatedAt()).isEqualTo(createdAt);
        assertThat(supplier.getUpdatedAt()).isEqualTo(updatedAt);
    }

    @Test
    void changesOnlySupplierStatus() {
        Supplier supplier = Supplier.create(
                "Campus Cafe",
                "Food/Coffee",
                "COM3",
                "1",
                "Beside the entrance",
                1.2948,
                103.7716,
                LocalTime.of(8, 0),
                LocalTime.of(18, 0),
                "https://example.com/cafe.jpg",
                SupplierStatus.ACTIVE);
        supplier.prepareForCreate();
        OffsetDateTime createdAt = supplier.getCreatedAt();
        OffsetDateTime updatedAt = supplier.getUpdatedAt();

        boolean changed = supplier.changeStatus(SupplierStatus.INACTIVE);

        assertThat(changed).isTrue();
        assertThat(supplier.getStatus()).isEqualTo(SupplierStatus.INACTIVE);
        assertThat(supplier.getName()).isEqualTo("Campus Cafe");
        assertThat(supplier.getType()).isEqualTo("Food/Coffee");
        assertThat(supplier.getBuilding()).isEqualTo("COM3");
        assertThat(supplier.getCreatedAt()).isEqualTo(createdAt);
        assertThat(supplier.getUpdatedAt()).isEqualTo(updatedAt);
        assertThat(supplier.getVersion()).isZero();
    }

    @Test
    void reportsNoChangeForExistingStatus() {
        Supplier supplier = Supplier.create(
                "Campus Cafe",
                "Food",
                "COM3",
                null,
                null,
                1.2948,
                103.7716,
                null,
                null,
                null,
                SupplierStatus.INACTIVE);
        supplier.prepareForCreate();
        OffsetDateTime updatedAt = supplier.getUpdatedAt();

        boolean changed = supplier.changeStatus(SupplierStatus.INACTIVE);

        assertThat(changed).isFalse();
        assertThat(supplier.getStatus()).isEqualTo(SupplierStatus.INACTIVE);
        assertThat(supplier.getUpdatedAt()).isEqualTo(updatedAt);
        assertThat(supplier.getVersion()).isZero();
    }

    @Test
    void switchesBetweenExternalAndUploadedImageSources() {
        Supplier supplier = Supplier.create(
                "Campus Cafe", "Food", "COM3", null, null,
                1.2948, 103.7716, null, null,
                "https://example.com/original.jpg", SupplierStatus.ACTIVE);

        String previous = supplier.useUploadedImage("images/supplier/one", "image/webp");

        assertThat(previous).isNull();
        assertThat(supplier.getImageUrl()).isNull();
        assertThat(supplier.getImageObjectKey()).isEqualTo("images/supplier/one");
        assertThat(supplier.getImageContentType()).isEqualTo("image/webp");

        supplier.updateDetails(
                "Campus Cafe", "Food", "COM3", null, null,
                1.2948, 103.7716, null, null,
                "https://example.com/replacement.jpg");

        assertThat(supplier.getImageUrl()).isEqualTo("https://example.com/replacement.jpg");
        assertThat(supplier.hasUploadedImage()).isFalse();
        assertThat(supplier.getImageContentType()).isNull();
    }
}
