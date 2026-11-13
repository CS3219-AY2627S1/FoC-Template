package com.friendoncampus.user.repository;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import com.friendoncampus.user.domain.EmailVerificationAttempt;

public interface EmailVerificationAttemptRepository extends JpaRepository<EmailVerificationAttempt, UUID> {
    Optional<EmailVerificationAttempt> findFirstByUser_IdAndSentAtIsNotNullOrderBySentAtDesc(UUID userId);
    Optional<EmailVerificationAttempt> findFirstByUser_IdAndSentAtIsNotNullAndUsedAtIsNullAndInvalidatedAtIsNullOrderByCreatedAtDesc(UUID userId);
    @Modifying @Query("update EmailVerificationAttempt attempt set attempt.invalidatedAt = :now where attempt.user.id = :userId and attempt.usedAt is null and attempt.invalidatedAt is null")
    void invalidateActiveForUser(@Param("userId") UUID userId, @Param("now") OffsetDateTime now);
}
