/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-26 to 2026-09-28
 * Scope: Generated initial Supplier Service implementation and tests.
 */

package com.campuscouriers.supplier.dto;
import com.campuscouriers.supplier.entity.Building;
import com.campuscouriers.supplier.entity.BuildingStatus;

import java.util.UUID;

public record BuildingResponse(UUID id, String name, BuildingStatus status) {

    public static BuildingResponse from(Building building) {
        return new BuildingResponse(building.getId(), building.getName(), building.getStatus());
    }
}
