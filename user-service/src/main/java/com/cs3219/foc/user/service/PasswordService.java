package com.cs3219.foc.user.service;

import com.cs3219.foc.user.exception.EmailRateLimitException;
import com.cs3219.foc.user.exception.InvalidEmailTokenException;
import com.cs3219.foc.user.exception.InvalidPasswordException;
import com.cs3219.foc.user.exception.InvalidPasswordResetTokenException;
import com.cs3219.foc.user.exception.UserNotFoundException;
import com.cs3219.foc.user.model.dto.ChangePasswordRequest;
import com.cs3219.foc.user.model.dto.event.PasswordResetCompletedEvent;
import com.cs3219.foc.user.model.entity.EmailToken;
import com.cs3219.foc.user.model.entity.EmailTokenPurpose;
import com.cs3219.foc.user.model.entity.User;
import com.cs3219.foc.user.repository.EmailTokenRepository;
import com.cs3219.foc.user.repository.RefreshTokenRepository;
import com.cs3219.foc.user.repository.UserRepository;
import com.cs3219.foc.user.security.CurrentUserService;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class PasswordService {
    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmailTokenService emailTokenService;
    private final EmailTokenRepository emailTokenRepository;
    private final ApplicationEventPublisher events;
    private final CurrentUserService currentUserService;

    @Transactional
    public void requestPasswordReset(String email) {
        userRepository.findForUpdateByEmail(email).ifPresent(user -> {
            try {
                emailTokenService.issue(user, user.getEmail(), EmailTokenPurpose.PASSWORD_RESET);
            } catch (EmailRateLimitException exception) {
                // Keep the public response generic without issuing or sending another link.
            }
        });
    }

    @Transactional
    public void resetPassword(String token, String newPassword) {
        // consume holds the user lock; deleting the token and saving the password commit together.
        EmailToken stored;
        try {
            stored = emailTokenService.consume(token, EmailTokenPurpose.PASSWORD_RESET);
        } catch (InvalidEmailTokenException exception) {
            throw new InvalidPasswordResetTokenException();
        }
        var user = userRepository.findById(stored.getUserId()).orElseThrow();
        if (!stored.getEmail().equals(user.getEmail())) {
            throw new InvalidPasswordResetTokenException();
        }
        user.setEmailVerified(true);
        savePassword(user, newPassword);
        events.publishEvent(new PasswordResetCompletedEvent(user.getId(), user.getEmail()));
    }

    @Transactional
    public void changePassword(UUID userId, ChangePasswordRequest request) {
        var user =
                userRepository.findForUpdateById(userId).orElseThrow(() -> new UserNotFoundException("User not found"));
        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw new InvalidPasswordException("currentPassword", "Current password is incorrect");
        }
        if (request.currentPassword().equals(request.newPassword())) {
            throw new InvalidPasswordException("newPassword", "New password must differ from the current password");
        }
        savePassword(user, request.newPassword());
    }

    @Transactional
    public void changePassword(ChangePasswordRequest request) {
        var userId = currentUserService.requireCurrentUserId();
        changePassword(userId, request);
    }

    private void savePassword(User user, String newPassword) {
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.saveAndFlush(user);
        refreshTokenRepository.deleteAllByUserId(user.getId());
        emailTokenRepository.deleteAllByUserIdAndPurposeIn(
                user.getId(), List.of(EmailTokenPurpose.PASSWORD_RESET, EmailTokenPurpose.EMAIL_CHANGE));
    }
}
