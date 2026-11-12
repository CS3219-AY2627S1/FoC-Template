/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-26 to 2026-11-10
 * Scope: Generated and tested building creation, listing, update, and lifecycle administration.
 */
package com.campuscouriers.supplier.controller;

import com.campuscouriers.supplier.dto.BuildingResponse;
import com.campuscouriers.supplier.dto.CreateBuildingRequest;
import com.campuscouriers.supplier.dto.ItemListResponse;
import com.campuscouriers.supplier.dto.UpdateBuildingRequest;
import com.campuscouriers.supplier.service.BuildingService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;

import java.net.URI;
import java.util.UUID;

@RestController
@RequestMapping("/buildings")
public class BuildingController {

    private final BuildingService buildingService;

    public BuildingController(BuildingService buildingService) {
        this.buildingService = buildingService;
    }

    @PostMapping
    public ResponseEntity<BuildingResponse> create(@Valid @RequestBody CreateBuildingRequest request) {
        BuildingResponse response = buildingService.create(request);
        return ResponseEntity.created(URI.create("/buildings/" + response.id())).body(response);
    }

    @GetMapping
    public ItemListResponse<BuildingResponse> findActive() {
        return buildingService.findActive();
    }

    @GetMapping("/deactivated")
    public ItemListResponse<BuildingResponse> findDeactivated() {
        return buildingService.findDeactivated();
    }

    @GetMapping("/{id}")
    public BuildingResponse findById(@PathVariable UUID id) {
        return buildingService.findById(id);
    }

    @PutMapping("/{id}")
    public BuildingResponse update(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateBuildingRequest request
    ) {
        return buildingService.update(id, request);
    }

    @PostMapping("/{id}/deactivate")
    public BuildingResponse deactivate(@PathVariable UUID id) {
        return buildingService.deactivate(id);
    }

    @PostMapping("/{id}/reactivate")
    public BuildingResponse reactivate(@PathVariable UUID id) {
        return buildingService.reactivate(id);
    }
}
