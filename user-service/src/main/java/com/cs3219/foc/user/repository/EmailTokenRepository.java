package com.cs3219.foc.user.repository;

import com.cs3219.foc.user.model.entity.EmailToken;
import com.cs3219.foc.user.model.entity.EmailTokenPurpose;
import java.util.Collection;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EmailTokenRepository extends JpaRepository<EmailToken, UUID> {
    void deleteAllByUserIdAndPurposeIn(UUID userId, Collection<EmailTokenPurpose> purposes);

    Optional<EmailToken> findByUserIdAndPurpose(UUID userId, EmailTokenPurpose purpose);

    Optional<EmailToken> findByTokenHash(String tokenHash);

    @Query("select t.userId from EmailToken t where t.tokenHash = :hash")
    Optional<UUID> findUserIdByTokenHash(@Param("hash") String hash);
}
