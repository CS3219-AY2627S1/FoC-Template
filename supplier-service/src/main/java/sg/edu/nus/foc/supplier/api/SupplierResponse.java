package sg.edu.nus.foc.supplier.api;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonInclude;
import sg.edu.nus.foc.supplier.supplier.Supplier;
import sg.edu.nus.foc.supplier.supplier.SupplierDetails;

/**
 * Supplier as returned by the API. Times are campus-local "HH:mm".
 *
 * @param openNow        whether the supplier is open at the time of the request
 * @param distanceMeters only present when the request included {@code lat}/{@code lng}
 */
public record SupplierResponse(
        String id,
        String name,
        String type,
        String building,
        String floor,
        String locationDescription,
        double latitude,
        double longitude,
        String openingTime,
        String closingTime,
        String imageUrl,
        boolean active,
        boolean openNow,
        @JsonInclude(JsonInclude.Include.NON_NULL) Long distanceMeters,
        Instant createdAt,
        Instant updatedAt) {

    public static SupplierResponse from(Supplier supplier, boolean openNow, Double distanceMeters) {
        SupplierDetails d = supplier.details();
        return new SupplierResponse(
                supplier.id(), d.name(), d.type(), d.building(), d.floor(), d.locationDescription(),
                d.latitude(), d.longitude(),
                SupplierRequests.formatTime(d.openingTime()), SupplierRequests.formatTime(d.closingTime()),
                d.imageUrl(), supplier.active(), openNow,
                distanceMeters == null ? null : Math.round(distanceMeters),
                supplier.createdAt(), supplier.updatedAt());
    }
}
