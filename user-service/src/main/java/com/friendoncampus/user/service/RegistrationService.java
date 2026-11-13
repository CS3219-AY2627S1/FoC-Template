package com.friendoncampus.user.service;

import java.util.Locale;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.repository.UserRepository;

@Service
public class RegistrationService {
    private final UserRepository users; private final PasswordEncoder passwordEncoder; private final EmailVerificationService emailVerifications;
    public RegistrationService(UserRepository users, PasswordEncoder passwordEncoder, EmailVerificationService emailVerifications) { this.users = users; this.passwordEncoder = passwordEncoder; this.emailVerifications = emailVerifications; }
    @Transactional(noRollbackFor = EmailVerificationDeliveryException.class)
    public User register(String email, String username, String password) {
        String normalizedEmail = email.trim().toLowerCase(Locale.ROOT);
        String normalizedUsername = username.toLowerCase(Locale.ROOT);
        if (!normalizedEmail.endsWith("@u.nus.edu") && !normalizedEmail.endsWith("@u.duke.nus.edu") && !normalizedEmail.endsWith("@u.yale-nus.edu.sg")) throw new IllegalArgumentException("email must use an eligible NUS student domain");
        if (users.findByEmail(normalizedEmail).isPresent()) throw new DuplicateRegistrationException("email");
        if (users.findByUsernameNormalized(normalizedUsername).isPresent()) throw new DuplicateRegistrationException("username");
        User user = users.save(User.register(normalizedEmail, username, normalizedUsername, passwordEncoder.encode(password)));
        emailVerifications.issueInitial(user);
        return user;
    }
}
