package com.cs3219.foc.supplier.model.entity;

import jakarta.persistence.*;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.Setter;

/**
 * The supplier's opening hours on one day of the week. A {@code closesAt} earlier than {@code opensAt} means the supplier
 * closes after midnight, which the next day.
 */
@Entity
@Table(name = "supplier_opening_hours")
@Getter
@Setter
@Builder
@RequiredArgsConstructor
@AllArgsConstructor
public class SupplierOpeningHours {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "supplier_id", nullable = false)
    private Supplier supplier;

    @Convert(converter = DayOfWeekConverter.class)
    @Column(nullable = false)
    private DayOfWeek dayOfWeek;

    @Column(nullable = false)
    private LocalTime opensAt;

    @Column(nullable = false)
    private LocalTime closesAt;

    public boolean closesAfterMidnight() {
        return closesAt.isBefore(opensAt);
    }
}
