package com.friendoncampus.admin;

import jakarta.persistence.*;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

@Entity @Table(name = "admin_cases")
public class AdminCase {
    public enum State { OPEN, UNDER_REVIEW, RESOLVED }
    @Id private UUID id;
    @Column(name = "order_id", nullable = false, unique = true) private UUID orderId;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private State state;
    @Column(name = "reviewer_id") private UUID reviewerId;
    @Column(name = "closure_operation_id") private UUID closureOperationId;
    @Version private long revision;
    @ElementCollection
    @CollectionTable(name = "admin_case_participants", joinColumns = @JoinColumn(name = "case_id"))
    @Column(name = "user_id", nullable = false) private Set<UUID> participants = new HashSet<>();
    protected AdminCase() { }
    public UUID getId() { return id; }
    public UUID getOrderId() { return orderId; }
    public State getState() { return state; }
    public UUID getReviewerId() { return reviewerId; }
    public UUID getClosureOperationId() { return closureOperationId; }
    public Set<UUID> getParticipants() { return Set.copyOf(participants); }
}
