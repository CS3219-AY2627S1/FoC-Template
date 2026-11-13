package com.friendoncampus.admin;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AdminCaseRepository extends JpaRepository<AdminCase, UUID> {
    @EntityGraph(attributePaths = "participants")
    Optional<AdminCase> findWithParticipantsById(UUID id);
}
