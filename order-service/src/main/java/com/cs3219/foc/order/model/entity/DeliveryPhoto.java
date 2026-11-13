package com.cs3219.foc.order.model.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

// courier photo info, store in S3 under {@code photoKey}
@Entity
@Table(name = "delivery_photos")
@Getter
@Setter
@NoArgsConstructor
public class DeliveryPhoto {
    @Id
    @Column(name = "id")
    private UUID id;

    @Column(name = "errand_id", nullable = false)
    private UUID errandId;

    @Column(name = "photo_key", nullable = false, length = 255)
    private String photoKey;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;
}
