package com.cs3219.foc.order.model.dto;

import java.util.UUID;

public record ReserveCreditRequest(UUID operationId, UUID errandId, long amount) {}
