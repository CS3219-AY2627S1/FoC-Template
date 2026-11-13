package com.cs3219.foc.order.model.dto;

import com.cs3219.foc.order.model.entity.CreditState;
import com.cs3219.foc.order.model.entity.ErrandStatus;
import java.util.UUID;

public record ErrandActionResponse(UUID errandId, ErrandStatus status, CreditState creditState) {}
