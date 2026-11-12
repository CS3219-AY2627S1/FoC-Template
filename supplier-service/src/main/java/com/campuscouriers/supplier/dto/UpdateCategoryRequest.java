/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Scope: Implementation and test assistance for category and building administration.
 */
package com.campuscouriers.supplier.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateCategoryRequest(
        @NotBlank(message = "Category name is required")
        @Size(max = 60, message = "Category name must not exceed 60 characters")
        String name
) {
}
