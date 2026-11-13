package com.cs3219.foc.credit.model.dto.event;

import java.util.UUID;

public record CreditReservedEvent(UUID operationId, UUID errandId, UUID userId, long amount) {}
