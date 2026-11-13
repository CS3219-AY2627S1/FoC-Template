package com.friendoncampus.user.service;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Locale;
import java.util.Optional;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.user.config.AdminBootstrapProperties;
import com.friendoncampus.user.config.MailProperties;
import com.friendoncampus.user.domain.AdminBootstrapState;
import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.domain.UserRole;
import com.friendoncampus.user.domain.UserStatus;
import com.friendoncampus.user.repository.AdminBootstrapStateRepository;
import com.friendoncampus.user.repository.UserRepository;

/** Deployment-only creation or promotion of the first administrator. */
@Service
public class AdminBootstrapService {
    private final AdminBootstrapProperties properties;
    private final AdminBootstrapStateRepository states;
    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final EmailVerificationService emailVerifications;
    private final MailProperties mail;
    private final Clock clock;

    public AdminBootstrapService(AdminBootstrapProperties properties, AdminBootstrapStateRepository states,
            UserRepository users, PasswordEncoder passwords, EmailVerificationService emailVerifications, MailProperties mail,
            Clock clock) {
        this.properties = properties;
        this.states = states;
        this.users = users;
        this.passwords = passwords;
        this.emailVerifications = emailVerifications;
        this.mail = mail;
        this.clock = clock;
    }

    @Transactional
    public void bootstrap() {
        if (!properties.isRequested()) {
            return;
        }
        properties.requireCompleteConfiguration();

        AdminBootstrapState state = states.findByIdForUpdate(AdminBootstrapState.FIRST_ADMIN)
                .orElseThrow(() -> new IllegalStateException("First-admin bootstrap state is missing"));
        if (state.isCompleted()) {
            return;
        }

        Optional<User> existingAdmin = users.findFirstByRolesContaining(UserRole.ADMIN);
        if (existingAdmin.isPresent()) {
            state.complete(existingAdmin.get().getId(), now());
            states.save(state);
            return;
        }

        String email = properties.email().trim().toLowerCase(Locale.ROOT);
        String username = properties.username().trim();
        String normalizedUsername = username.toLowerCase(Locale.ROOT);
        validate(email, username, properties.password());

        Optional<User> byEmail = users.findByEmail(email);
        Optional<User> byUsername = users.findByUsernameNormalized(normalizedUsername);
        if (byEmail.isPresent() && byUsername.isPresent() && !byEmail.get().getId().equals(byUsername.get().getId())) {
            throw new IllegalStateException("Admin bootstrap email and username belong to different accounts");
        }

        Optional<User> configuredUser = byEmail.or(() -> byUsername);
        if (configuredUser.isEmpty()) {
            requireSendGridDelivery();
        }
        User admin = configuredUser.orElseGet(() -> users.save(User.bootstrapAdmin(email, username,
                normalizedUsername, passwords.encode(properties.password()))));
        if (!admin.hasRole(UserRole.ADMIN)) {
            admin.promoteToAdmin();
            users.save(admin);
        }
        if (admin.getStatus() == UserStatus.UNVERIFIED) {
            requireSendGridDelivery();
            emailVerifications.issueInitial(admin);
        }
        state.complete(admin.getId(), now());
        states.save(state);
    }

    private void validate(String email, String username, String password) {
        if (!email.endsWith("@u.nus.edu") && !email.endsWith("@u.duke.nus.edu") && !email.endsWith("@u.yale-nus.edu.sg")) {
            throw new IllegalStateException("ADMIN_BOOTSTRAP_EMAIL must use an eligible NUS student domain");
        }
        if (username.isBlank() || username.length() > 20) {
            throw new IllegalStateException("ADMIN_BOOTSTRAP_USERNAME must be between 1 and 20 characters");
        }
        if (password.length() < 15 || password.length() > 64) {
            throw new IllegalStateException("ADMIN_BOOTSTRAP_PASSWORD must be between 15 and 64 characters");
        }
    }

    private void requireSendGridDelivery() {
        if (!"sendgrid".equalsIgnoreCase(mail.provider()) || mail.sendgridApiKey() == null || mail.sendgridApiKey().isBlank()
                || mail.fromEmail() == null || mail.fromEmail().isBlank()) {
            throw new IllegalStateException("MAIL_PROVIDER=sendgrid, SENDGRID_API_KEY, and SENDGRID_FROM_EMAIL are required for admin bootstrap");
        }
    }

    private OffsetDateTime now() {
        return OffsetDateTime.now(clock).withOffsetSameInstant(ZoneOffset.UTC);
    }
}
