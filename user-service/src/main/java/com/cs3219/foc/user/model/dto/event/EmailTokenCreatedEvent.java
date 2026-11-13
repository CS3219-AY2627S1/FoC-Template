package com.cs3219.foc.user.model.dto.event;

import com.cs3219.foc.user.model.entity.EmailTokenPurpose;
import java.util.UUID;

public record EmailTokenCreatedEvent(UUID userId, String email, EmailTokenPurpose purpose, String token) {
    @Override
    public String toString() {
        return "EmailTokenCreatedEvent[userId=" + userId + ", purpose=" + purpose + "]";
    }
}
