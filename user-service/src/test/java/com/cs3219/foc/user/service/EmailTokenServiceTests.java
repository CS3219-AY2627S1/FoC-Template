package com.cs3219.foc.user.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.cs3219.foc.user.config.AccountMailProperties;
import com.cs3219.foc.user.exception.EmailRateLimitException;
import com.cs3219.foc.user.exception.InvalidEmailTokenException;
import com.cs3219.foc.user.model.dto.event.EmailTokenCreatedEvent;
import com.cs3219.foc.user.model.entity.EmailToken;
import com.cs3219.foc.user.model.entity.EmailTokenPurpose;
import com.cs3219.foc.user.model.entity.User;
import com.cs3219.foc.user.repository.EmailTokenRepository;
import com.cs3219.foc.user.repository.UserRepository;
import java.net.URI;
import java.time.*;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

class EmailTokenServiceTests {
    private final EmailTokenRepository emailTokenRepository = mock(EmailTokenRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final Instant now = Instant.parse("2026-10-08T00:00:00Z");
    private final EmailTokenService service = new EmailTokenService(
            emailTokenRepository,
            userRepository,
            new AccountMailProperties(
                    "mail@example.com",
                    URI.create("http://localhost:3000"),
                    Duration.ofMinutes(30),
                    Duration.ofSeconds(60)),
            Clock.fixed(now, ZoneOffset.UTC),
            events);
    private final User user =
            User.builder().id(UUID.randomUUID()).email("jamie@u.nus.edu").build();

    @Test
    void resendReplacesTheStoredHashAndExpiryInsteadOfAddingAnotherToken() {
        var stored = new EmailToken();
        stored.setTokenHash("old-hash");
        stored.setIssuedAt(OffsetDateTime.ofInstant(now.minusSeconds(61), ZoneOffset.UTC));
        when(emailTokenRepository.findByUserIdAndPurpose(user.getId(), EmailTokenPurpose.EMAIL_CHANGE))
                .thenReturn(Optional.of(stored));

        service.issue(user, "new@nus.edu.sg", EmailTokenPurpose.EMAIL_CHANGE);

        verify(emailTokenRepository).save(stored);
        var event = ArgumentCaptor.forClass(EmailTokenCreatedEvent.class);
        verify(events).publishEvent(event.capture());
        assertThat(stored.getTokenHash())
                .isNotEqualTo("old-hash")
                .isNotEqualTo(event.getValue().token());
        assertThat(stored.getExpiresAt().toInstant()).isEqualTo(now.plusSeconds(1800));
        assertThat(stored.getEmail()).isEqualTo("new@nus.edu.sg");
        assertThat(event.getValue().email()).isEqualTo("new@nus.edu.sg");
    }

    @Test
    void resendWithinTheIntervalDoesNotReplaceOrSendAToken() {
        var stored = new EmailToken();
        stored.setIssuedAt(OffsetDateTime.ofInstant(now.minusSeconds(30), ZoneOffset.UTC));
        when(emailTokenRepository.findByUserIdAndPurpose(user.getId(), EmailTokenPurpose.REGISTRATION))
                .thenReturn(Optional.of(stored));
        assertThatThrownBy(() -> service.issue(user, user.getEmail(), EmailTokenPurpose.REGISTRATION))
                .isInstanceOf(EmailRateLimitException.class);
        verify(emailTokenRepository, never()).save(any());
        verifyNoInteractions(events);
    }

    @Test
    void expiredTokenCannotBeConsumed() {
        var stored = new EmailToken();
        stored.setPurpose(EmailTokenPurpose.REGISTRATION);
        stored.setExpiresAt(OffsetDateTime.ofInstant(now, ZoneOffset.UTC));
        when(emailTokenRepository.findUserIdByTokenHash(anyString())).thenReturn(Optional.of(user.getId()));
        when(userRepository.findForUpdateById(user.getId())).thenReturn(Optional.of(user));
        when(emailTokenRepository.findByTokenHash(anyString())).thenReturn(Optional.of(stored));
        assertThatThrownBy(() -> service.consume("expired", EmailTokenPurpose.REGISTRATION))
                .isInstanceOf(InvalidEmailTokenException.class);
        verify(emailTokenRepository, never()).delete(any());
    }
}
