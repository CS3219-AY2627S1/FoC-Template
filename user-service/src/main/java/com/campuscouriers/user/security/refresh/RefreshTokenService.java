/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.security.refresh;

import com.campuscouriers.user.entity.Account;
import com.campuscouriers.user.entity.RefreshToken;
import com.campuscouriers.user.exception.InvalidRefreshTokenException;
import com.campuscouriers.user.repository.RefreshTokenRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.convert.DurationStyle;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.util.UUID;

@Service
public class RefreshTokenService {

    private final RefreshTokenRepository refreshTokenRepository;
    private final TokenHasher tokenHasher;
    private final Clock clock;
    private final Duration ttl;

    public RefreshTokenService(
            RefreshTokenRepository refreshTokenRepository,
            TokenHasher tokenHasher,
            Clock clock,
            @Value("${app.jwt.refresh-token-ttl}") String ttl
    ) {
        this.refreshTokenRepository = refreshTokenRepository;
        this.tokenHasher = tokenHasher;
        this.clock = clock;
        this.ttl = DurationStyle.detectAndParse(ttl);
    }

    // Issuing a Refresh token (expiry checked lazily)
    public String issue(Account account) {
        String rawToken = UUID.randomUUID().toString();
        RefreshToken token = new RefreshToken(tokenHasher.hash(rawToken), account, clock.instant().plus(ttl));
        refreshTokenRepository.save(token);
        return rawToken;
    }

    // Redeeming Refresh Token (one-time usage)
    public Account redeem(String rawToken) {

        RefreshToken token = refreshTokenRepository.findByTokenHash(tokenHasher.hash(rawToken))
                .orElseThrow(InvalidRefreshTokenException::new);

        if (refreshTokenRepository.consume(token.getId(), clock.instant()) == 0) {
            throw new InvalidRefreshTokenException();
        }

        return token.getAccount();
    }

    // Revoking Refresh Token on logout (no-op if unknown, already revoked, or owned by another account)
    public void revoke(String rawToken, UUID accountId) {
        refreshTokenRepository.revoke(tokenHasher.hash(rawToken), accountId);
    }

}
