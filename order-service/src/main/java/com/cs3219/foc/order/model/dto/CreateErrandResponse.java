package com.cs3219.foc.order.model.dto;

import com.cs3219.foc.order.model.entity.ErrandStatus;
import java.util.UUID;

public record CreateErrandResponse(UUID errandId, ErrandStatus status, String creationFailureCode, String queryUrl) {}
