package sg.edu.nus.cs3219.order.persistence;

import java.io.Serializable;
import java.util.Objects;

public class UserDeliveryPointId implements Serializable {

    private String userId;
    private Long deliveryPointId;

    public UserDeliveryPointId() {
    }

    public UserDeliveryPointId(String userId, Long deliveryPointId) {
        this.userId = userId;
        this.deliveryPointId = deliveryPointId;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public Long getDeliveryPointId() {
        return deliveryPointId;
    }

    public void setDeliveryPointId(Long deliveryPointId) {
        this.deliveryPointId = deliveryPointId;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof UserDeliveryPointId that)) {
            return false;
        }
        return Objects.equals(userId, that.userId) && Objects.equals(deliveryPointId, that.deliveryPointId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(userId, deliveryPointId);
    }
}
