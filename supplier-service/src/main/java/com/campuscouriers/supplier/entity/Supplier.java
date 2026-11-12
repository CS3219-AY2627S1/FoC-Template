/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-26 to 2026-10-02
 * Scope: Generated the supplier entity, update behavior, and lifecycle transitions.
 */
package com.campuscouriers.supplier.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;

import java.time.LocalTime;
import java.util.UUID;

@Entity
@Table(
        name = "suppliers",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_supplier_branch",
                columnNames = {"normalized_name", "building_id"}
        )
)
@Getter
public class Supplier {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 60)
    private String name;

    @Column(name = "normalized_name", nullable = false, length = 60)
    private String normalizedName;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id", nullable = false)
    private Category category;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "building_id", nullable = false)
    private Building building;

    @Column(length = 20)
    private String floor;

    @Column(name = "normalized_floor", nullable = false, length = 20)
    private String normalizedFloor;

    @Column(length = 500)
    private String description;

    @Column(name = "opening_time")
    private LocalTime openingTime;

    @Column(name = "closing_time")
    private LocalTime closingTime;

    @Column(name = "image_url", length = 500)
    private String imageUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private SupplierStatus status;

    protected Supplier() {
    }

    public Supplier(
            String name,
            String normalizedName,
            Category category,
            Building building,
            String floor,
            String normalizedFloor,
            String description,
            LocalTime openingTime,
            LocalTime closingTime,
            String imageUrl
    ) {
        this.name = name;
        this.normalizedName = normalizedName;
        this.category = category;
        this.building = building;
        this.floor = floor;
        this.normalizedFloor = normalizedFloor;
        this.description = description;
        this.openingTime = openingTime;
        this.closingTime = closingTime;
        this.imageUrl = imageUrl;
        this.status = SupplierStatus.ACTIVE;
    }

    public void updateDetails(
            String name,
            String normalizedName,
            Category category,
            Building building,
            String floor,
            String normalizedFloor,
            String description,
            LocalTime openingTime,
            LocalTime closingTime,
            String imageUrl
    ) {
        this.name = name;
        this.normalizedName = normalizedName;
        this.category = category;
        this.building = building;
        this.floor = floor;
        this.normalizedFloor = normalizedFloor;
        this.description = description;
        this.openingTime = openingTime;
        this.closingTime = closingTime;
        this.imageUrl = imageUrl;
    }

    public void deactivate() {
        this.status = SupplierStatus.INACTIVE;
    }

    public void reactivate() {
        this.status = SupplierStatus.ACTIVE;
    }
}
