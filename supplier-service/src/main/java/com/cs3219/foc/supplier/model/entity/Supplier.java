package com.cs3219.foc.supplier.model.entity;

import jakarta.persistence.*;
import java.time.DayOfWeek;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "suppliers")
@Getter
@Setter
@Builder
@RequiredArgsConstructor
@AllArgsConstructor
public class Supplier {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SupplierCategory category;

    @Column(nullable = false)
    private String building;

    private String floor;

    private String locationDescription;

    private Double latitude;

    private Double longitude;

    private String imageKey;

    /** Days without an entry are closed. */
    @OneToMany(mappedBy = "supplier", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("dayOfWeek")
    @Builder.Default
    private List<SupplierOpeningHours> openingHours = new ArrayList<>();

    @Builder.Default
    @Column(nullable = false)
    private boolean active = true;

    @CreationTimestamp
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    private OffsetDateTime updatedAt;

    /**
     * Replaces the weekly schedule. Days that already exist are updated in place instead of deleted and re-added
     */
    public void replaceOpeningHours(List<SupplierOpeningHours> hours) {
        var byDay = new EnumMap<DayOfWeek, SupplierOpeningHours>(DayOfWeek.class);
        hours.forEach(entry -> byDay.put(entry.getDayOfWeek(), entry));

        openingHours.removeIf(existing -> !byDay.containsKey(existing.getDayOfWeek()));
        for (var existing : openingHours) {
            var updated = byDay.remove(existing.getDayOfWeek());
            existing.setOpensAt(updated.getOpensAt());
            existing.setClosesAt(updated.getClosesAt());
        }
        byDay.values().forEach(entry -> {
            entry.setSupplier(this);
            openingHours.add(entry);
        });
        openingHours.sort(Comparator.comparing(SupplierOpeningHours::getDayOfWeek));
    }
}
