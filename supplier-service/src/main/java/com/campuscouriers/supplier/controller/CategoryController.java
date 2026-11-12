/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-26 to 2026-11-10
 * Scope: Generated and tested category creation, listing, update, and lifecycle administration.
 */
package com.campuscouriers.supplier.controller;

import com.campuscouriers.supplier.dto.CategoryResponse;
import com.campuscouriers.supplier.dto.CreateCategoryRequest;
import com.campuscouriers.supplier.dto.ItemListResponse;
import com.campuscouriers.supplier.dto.UpdateCategoryRequest;
import com.campuscouriers.supplier.service.CategoryService;
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
@RequestMapping("/categories")
public class CategoryController {

    private final CategoryService categoryService;

    public CategoryController(CategoryService categoryService) {
        this.categoryService = categoryService;
    }

    @PostMapping
    public ResponseEntity<CategoryResponse> create(@Valid @RequestBody CreateCategoryRequest request) {
        CategoryResponse response = categoryService.create(request);
        return ResponseEntity.created(URI.create("/categories/" + response.id())).body(response);
    }

    @GetMapping
    public ItemListResponse<CategoryResponse> findActive() {
        return categoryService.findActive();
    }

    @GetMapping("/deactivated")
    public ItemListResponse<CategoryResponse> findDeactivated() {
        return categoryService.findDeactivated();
    }

    @GetMapping("/{id}")
    public CategoryResponse findById(@PathVariable UUID id) {
        return categoryService.findById(id);
    }

    @PutMapping("/{id}")
    public CategoryResponse update(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateCategoryRequest request
    ) {
        return categoryService.update(id, request);
    }

    @PostMapping("/{id}/deactivate")
    public CategoryResponse deactivate(@PathVariable UUID id) {
        return categoryService.deactivate(id);
    }

    @PostMapping("/{id}/reactivate")
    public CategoryResponse reactivate(@PathVariable UUID id) {
        return categoryService.reactivate(id);
    }
}
