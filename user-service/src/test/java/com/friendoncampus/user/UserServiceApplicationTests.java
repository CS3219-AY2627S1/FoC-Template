package com.friendoncampus.user;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import com.friendoncampus.user.repository.UserRepository;
import com.friendoncampus.user.repository.PasswordResetTokenRepository;
import com.friendoncampus.user.repository.PasswordResetRequestCooldownRepository;
import com.friendoncampus.user.repository.PasswordResetRequestGuardRepository;
import com.friendoncampus.user.repository.EmailVerificationAttemptRepository;
import com.friendoncampus.user.repository.AdminBootstrapStateRepository;
import com.friendoncampus.user.repository.AdminLifecycleStateRepository;
import com.friendoncampus.user.support.JwtTestProperties;

@SpringBootTest(properties = {
        "spring.autoconfigure.exclude="
                + "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,"
                + "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration,"
                + "org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration"
})
class UserServiceApplicationTests {
    @MockitoBean private com.friendoncampus.user.service.UserAccountAudit accountAudit;
    @MockitoBean private com.friendoncampus.user.messaging.UserSanctionService sanctions;
    @MockitoBean private com.friendoncampus.user.messaging.UserSanctionOutbox sanctionOutbox;
    @MockitoBean
    private com.friendoncampus.user.messaging.UserOutboxRepository userOutboxRepository;

    @MockitoBean
    private UserRepository userRepository;

    @MockitoBean
    private PasswordResetTokenRepository passwordResetTokenRepository;

    @MockitoBean
    private PasswordResetRequestCooldownRepository passwordResetRequestCooldownRepository;

    @MockitoBean
    private PasswordResetRequestGuardRepository passwordResetRequestGuardRepository;

    @MockitoBean
    private EmailVerificationAttemptRepository emailVerificationAttemptRepository;

    @MockitoBean
    private AdminBootstrapStateRepository adminBootstrapStateRepository;

    @MockitoBean
    private AdminLifecycleStateRepository adminLifecycleStateRepository;

    @DynamicPropertySource
    static void jwtProperties(DynamicPropertyRegistry registry) {
        JwtTestProperties.register(registry);
    }

    @Test
    void contextLoads() {
    }
}
