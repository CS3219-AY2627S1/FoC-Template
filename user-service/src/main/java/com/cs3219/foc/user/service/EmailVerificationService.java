package com.cs3219.foc.user.service;

import com.cs3219.foc.user.exception.EmailVerificationException;
import com.cs3219.foc.user.model.entity.EmailTokenPurpose;
import com.cs3219.foc.user.model.entity.User;
import com.cs3219.foc.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class EmailVerificationService {
    private final UserRepository userRepository;
    private final EmailTokenService emailTokenService;

    public void createRegistrationVerification(User user) {
        emailTokenService.issue(user, user.getEmail(), EmailTokenPurpose.REGISTRATION);
    }

    public void resendRegistrationVerification(String email) {
        userRepository
                .findForUpdateByEmail(email)
                .filter(user -> !user.isEmailVerified())
                .ifPresent(this::createRegistrationVerification);
    }

    public void verifyEmail(String token) {
        var stored = emailTokenService.consume(token, EmailTokenPurpose.REGISTRATION);
        var user = userRepository.findById(stored.getUserId()).orElseThrow();
        if (!stored.getEmail().equals(user.getEmail())) {
            throw new EmailVerificationException(HttpStatus.BAD_REQUEST, "This verification link is no longer valid.");
        }
        user.setEmailVerified(true);
    }
}
