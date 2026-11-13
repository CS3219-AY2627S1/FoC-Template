package com.cs3219.foc.user.service;

import com.cs3219.foc.user.exception.EmailVerificationException;
import com.cs3219.foc.user.exception.UnsupportedEmailDomainException;
import com.cs3219.foc.user.exception.UserNotFoundException;
import com.cs3219.foc.user.model.dto.event.EmailChangedEvent;
import com.cs3219.foc.user.model.entity.EmailTokenPurpose;
import com.cs3219.foc.user.repository.UserRepository;
import com.cs3219.foc.user.security.CurrentUserService;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class EmailChangeService {
    private final UserRepository userRepository;
    private final EmailTokenService emailTokenService;
    private final ApplicationEventPublisher events;
    private final CurrentUserService currentUserService;

    @Transactional
    public void requestChange(UUID userId, String email) {
        var user =
                userRepository.findForUpdateById(userId).orElseThrow(() -> new UserNotFoundException("User not found"));
        if (!NusEmailPolicy.isAllowed(email)) {
            throw new UnsupportedEmailDomainException();
        }
        if (user.getEmail().equals(email)) {
            throw new EmailVerificationException(HttpStatus.BAD_REQUEST, "Enter a different email address.");
        }
        requireAvailable(email);
        emailTokenService.issue(user, email, EmailTokenPurpose.EMAIL_CHANGE);
    }

    @Transactional
    public void requestChange(String email) {
        var userId = currentUserService.requireCurrentUserId();
        requestChange(userId, email);
    }

    @Transactional
    public void confirmChange(String token) {
        var stored = emailTokenService.consume(token, EmailTokenPurpose.EMAIL_CHANGE);
        var user = userRepository.findById(stored.getUserId()).orElseThrow();
        var oldEmail = user.getEmail();
        user.setEmail(stored.getEmail());
        user.setEmailVerified(true);
        try {
            userRepository.saveAndFlush(user);
        } catch (DataIntegrityViolationException exception) {
            // The unique constraint also covers addresses claimed since the request was sent.
            if (exception.getCause() instanceof ConstraintViolationException constraint
                    && "users_email_key".equals(constraint.getConstraintName())) {
                throw emailInUse();
            }
            throw exception;
        }
        events.publishEvent(new EmailChangedEvent(user.getId(), oldEmail, user.getEmail()));
    }

    private void requireAvailable(String email) {
        if (userRepository.existsByEmail(email)) {
            throw emailInUse();
        }
    }

    private static EmailVerificationException emailInUse() {
        return new EmailVerificationException(HttpStatus.CONFLICT, "This email address is already in use.");
    }
}
