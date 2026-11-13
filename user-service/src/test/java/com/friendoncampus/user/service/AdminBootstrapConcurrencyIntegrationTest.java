package com.friendoncampus.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.matches;

import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.friendoncampus.user.repository.UserRepository;
import com.friendoncampus.user.support.JwtTestProperties;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:adminbootstrap;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000",
        "spring.datasource.driver-class-name=org.h2.Driver", "spring.datasource.username=sa", "spring.datasource.password=",
        "app.admin-bootstrap.email=first.admin@u.nus.edu", "app.admin-bootstrap.username=First Admin",
        "app.admin-bootstrap.password=password-with-at-least-15-chars",
        "app.mail.provider=sendgrid", "app.mail.sendgrid-api-key=test-key", "app.mail.from-email=noreply@example.com" })
class AdminBootstrapConcurrencyIntegrationTest {
    @Autowired AdminBootstrapService bootstrap;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate jdbc;
    @MockitoBean EmailVerificationMailer mailer;

    @DynamicPropertySource
    static void jwtProperties(DynamicPropertyRegistry registry) {
        JwtTestProperties.register(registry);
    }

    @BeforeEach
    void resetDatabase() {
        jdbc.update("UPDATE admin_bootstrap_state SET completed_at = NULL, admin_id = NULL WHERE id = 'FIRST_ADMIN'");
        jdbc.update("DELETE FROM email_verification_attempts");
        jdbc.update("DELETE FROM users");
        clearInvocations(mailer);
    }

    @Test
    void simultaneousStartsCreateOneAdminAndSendOneVerification() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Callable<Void> runBootstrap = () -> { bootstrap.bootstrap(); return null; };
            Future<Void> first = pool.submit(runBootstrap);
            Future<Void> second = pool.submit(runBootstrap);
            first.get();
            second.get();
        } finally {
            pool.shutdownNow();
        }

        assertThat(users.count()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM email_verification_attempts", Integer.class)).isEqualTo(1);
        verify(mailer, times(1)).sendVerificationCode(eq("first.admin@u.nus.edu"), matches("\\d{6}"));
    }
}
