/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-26 to 2026-11-10
 * Scope: Generated the category entity and later administration behavior.
 */
package com.campuscouriers.supplier.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;

import java.util.UUID;

@Entity
@Table(name = "categories")
@Getter
public class Category {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 60)
    private String name;

    @Column(name = "normalized_name", nullable = false, unique = true, length = 60)
    private String normalizedName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CategoryStatus status;

    protected Category() {
    }

    public Category(String name, String normalizedName) {
        this.name = name;
        this.normalizedName = normalizedName;
        this.status = CategoryStatus.ACTIVE;
    }

    public void rename(String name, String normalizedName) {
        this.name = name;
        this.normalizedName = normalizedName;
    }

    public void deactivate() {
        this.status = CategoryStatus.RETIRED;
    }

    public void reactivate() {
        this.status = CategoryStatus.ACTIVE;
    }
}
