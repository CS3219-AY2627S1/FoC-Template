package com.cs3219.foc.user.service;

import com.cs3219.foc.user.config.AuthProperties;
import com.cs3219.foc.user.exception.InvalidRefreshTokenException;
import com.cs3219.foc.user.model.dto.AccessTokenDto;
import com.cs3219.foc.user.model.dto.RefreshTokenDto;
import com.cs3219.foc.user.model.entity.RefreshToken;
import com.cs3219.foc.user.model.entity.UserRole;
import com.cs3219.foc.user.repository.RefreshTokenRepository;
import com.cs3219.foc.user.repository.UserRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class TokenService {
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private final RefreshTokenRepository refreshTokenRepository;
    private final UserRepository userRepository;
    private final Clock clock;
    private final AuthProperties authProperties;
    private final JwtEncoder jwtEncoder;

    public AccessTokenDto createAccessToken(UUID userId, List<UserRole> roles) {
        var now = OffsetDateTime.now(clock);
        var expiresAt = now.plus(authProperties.accessTokenTtl());

        var claims = JwtClaimsSet.builder()
                .subject(userId.toString())
                .issuedAt(now.toInstant())
                .expiresAt(expiresAt.toInstant())
                .claim("roles", roles.stream().map(UserRole::name).toList())
                .build();

        var headers = JwsHeader.with(SignatureAlgorithm.ES256).build();

        var accessToken =
                jwtEncoder.encode(JwtEncoderParameters.from(headers, claims)).getTokenValue();

        return new AccessTokenDto(accessToken, expiresAt);
    }

    @Transactional
    public RefreshTokenDto createRefreshToken(UUID userId) {
        var refreshToken = generateRefreshToken();
        var refreshTokenHash = hashRefreshToken(refreshToken);
        var now = OffsetDateTime.now(clock);
        var expiresAt = now.plus(authProperties.refreshTokenTtl());

        var refreshTokenEntity = RefreshToken.builder()
                .userId(userId)
                .tokenHash(refreshTokenHash)
                .createdAt(now)
                .expiresAt(expiresAt)
                .build();

        refreshTokenRepository.save(refreshTokenEntity);

        return new RefreshTokenDto(refreshToken, userId, expiresAt);
    }

    @Transactional
    public RefreshTokenDto rotateRefreshToken(String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) {
            throw new InvalidRefreshTokenException("Invalid refresh token");
        }

        var tokenHash = hashRefreshToken(refreshToken);
        // Lock the account before the token, consistently with password changes.
        // Read only the ID first so a revoked token is not cached as an entity.
        var ownerId = refreshTokenRepository
                .findUserIdByTokenHash(tokenHash)
                .orElseThrow(() -> new InvalidRefreshTokenException("Invalid refresh token"));
        userRepository
                .findForUpdateById(ownerId)
                .orElseThrow(() -> new InvalidRefreshTokenException("Invalid refresh token"));
        var storedToken = refreshTokenRepository
                .findByTokenHash(tokenHash)
                .orElseThrow(() -> new InvalidRefreshTokenException("Invalid refresh token"));

        var now = OffsetDateTime.now(clock);
        if (!storedToken.getExpiresAt().isAfter(now)) {
            throw new InvalidRefreshTokenException("Refresh token has expired");
        }

        var userId = storedToken.getUserId();

        refreshTokenRepository.delete(storedToken);

        return createRefreshToken(userId);
    }

    @Transactional
    public void revokeRefreshToken(String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) {
            return;
        }

        var tokenHash = hashRefreshToken(refreshToken);
        refreshTokenRepository.deleteByTokenHash(tokenHash);
    }

    @Transactional
    public void cleanExpiredRefreshTokens() {
        var now = OffsetDateTime.now(clock);
        refreshTokenRepository.deleteAllByExpiresAtBefore(now);
    }

    private static String generateRefreshToken() {
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String hashRefreshToken(String token) {
        try {
            var digest = MessageDigest.getInstance("SHA-256");

            return Base64.getUrlEncoder()
                    .withoutPadding()
                    .encodeToString(digest.digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
