package sg.edu.nus.cs3219.order.rest;

import jakarta.validation.constraints.Size;

public record UpdateDeliveryPointRequest(
        @Size(max = 200) String name,
        @Size(max = 200) String building,
        @Size(max = 500) String description,
        Double latitude,
        Double longitude,
        @Size(max = 80) String nickname
) {
}
