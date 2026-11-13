package sg.edu.nus.foc.order.messagingpublisher.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import sg.edu.nus.foc.order.domain.OrderStatus;

@Getter
@Setter
@NoArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonInclude(JsonInclude.Include.ALWAYS)
public class OrderCompletionTaskEvent implements OrderTaskEvent {

    private String eventId;
    private String eventType;
    private String orderId;
    private OrderStatus orderStatus;
    private long creditAmount;
    private Instant occurredAt;
    private String courierId;

    // Operational metadata is stored in outbox columns and Pub/Sub attributes.
    @JsonIgnore
    private int eventVersion;

    @JsonIgnore
    private long orderVersion;
}
