package com.cs3219.foc.order.model.entity;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

// How far one person has read an errand's chat: everything sent up to {@code lastReadAt}
@Entity
@Table(name = "errand_chat_reads")
@IdClass(ErrandChatRead.Key.class)
@Getter
@Setter
@NoArgsConstructor
public class ErrandChatRead {
    @Id
    @Column(name = "errand_id")
    private UUID errandId;

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "last_read_at", nullable = false)
    private OffsetDateTime lastReadAt;

    public record Key(UUID errandId, UUID userId) implements Serializable {}
}
