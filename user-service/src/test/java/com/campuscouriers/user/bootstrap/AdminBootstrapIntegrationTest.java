/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Tool and date: Anthropic Claude (model unrecorded), 2026-10-09 to 2026-10-15
 * Scope (AI-24): Generated code, configuration and tests for the specified user event, Kafka setup and outbox changes.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.bootstrap;

import com.campuscouriers.user.auth.AuthService;
import com.campuscouriers.user.auth.dto.RegisterRequest;
import com.campuscouriers.user.bootstrap.AdminBootstrapService.Outcome;
import com.campuscouriers.user.entity.Account;
import com.campuscouriers.user.entity.AccountType;
import com.campuscouriers.user.repository.AccountRepository;
import com.campuscouriers.user.repository.ProfileRepository;
import com.campuscouriers.user.repository.RefreshTokenRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static com.campuscouriers.user.TestConstants.*;
import static org.assertj.core.api.Assertions.assertThat;

// Runs against a real PostgreSQL, since the advisory lock and unique constraint are what make concurrent bootstraps safe
@SpringBootTest
@ActiveProfiles("test")
@Testcontainers
class AdminBootstrapIntegrationTest {

    private static final String ADMIN_EMAIL = "admin@u.nus.edu";

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void configureProps(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("app.bootstrap-admin.name", () -> "Admin");
        registry.add("app.bootstrap-admin.email", () -> ADMIN_EMAIL);
        registry.add("app.bootstrap-admin.password", () -> VALID_PASSWORD);
    }

    @Autowired private AdminBootstrapService adminBootstrapService;
    @Autowired private AuthService authService;
    @Autowired private AccountRepository accountRepository;
    @Autowired private ProfileRepository profileRepository;
    @Autowired private RefreshTokenRepository refreshTokenRepository;
    @Autowired private PasswordEncoder passwordEncoder;

    private void deleteAllAccounts() {
        refreshTokenRepository.deleteAll();
        profileRepository.deleteAll();
        accountRepository.deleteAll();
    }

    @Test
    void bootstrap_createsAdministratorWithHashedPasswordAndProfile() {
        deleteAllAccounts();
        adminBootstrapService.bootstrap();

        Account admin = accountRepository.findByEmail(ADMIN_EMAIL).orElseThrow();
        assertThat(admin.getType()).isEqualTo(AccountType.Administrator);
        assertThat(passwordEncoder.matches(VALID_PASSWORD, admin.getPasswordHash())).isTrue();
        assertThat(profileRepository.findById(admin.getId())).isPresent();
    }

    @Test
    void bootstrap_runRepeatedly_createsOnlyOneAdministrator() {
        deleteAllAccounts();

        assertThat(adminBootstrapService.bootstrap()).isEqualTo(Outcome.CREATED);
        assertThat(adminBootstrapService.bootstrap()).isEqualTo(Outcome.ADMIN_EXISTS);

        assertThat(accountRepository.count()).isEqualTo(1);
    }

    @Test
    void bootstrap_runConcurrently_createsExactlyOneAdministrator() throws Exception {
        deleteAllAccounts();

        int instances = 4;
        CountDownLatch start = new CountDownLatch(1);
        Callable<Outcome> bootstrap = () -> {
            start.await();
            return adminBootstrapService.bootstrap();
        };

        ExecutorService executor = Executors.newFixedThreadPool(instances);
        try {
            List<Future<Outcome>> futures = new ArrayList<>();
            for (int i = 0; i < instances; i++) {
                futures.add(executor.submit(bootstrap));
            }
            start.countDown();

            List<Outcome> outcomes = new ArrayList<>();
            for (Future<Outcome> future : futures) {
                outcomes.add(future.get());  // rethrows if any instance failed on a constraint violation
            }

            assertThat(outcomes).containsOnlyOnce(Outcome.CREATED);
            assertThat(outcomes).filteredOn(o -> o == Outcome.ADMIN_EXISTS).hasSize(instances - 1);
        } finally {
            executor.shutdownNow();
        }

        assertThat(accountRepository.count()).isEqualTo(1);
    }

    @Test
    void register_onEmptyDatabase_createsStudentNotAdministrator() {
        deleteAllAccounts();

        authService.register(new RegisterRequest(VALID_NAME, VALID_EMAIL, VALID_PASSWORD));

        assertThat(accountRepository.findByEmail(VALID_EMAIL).orElseThrow().getType()).isEqualTo(AccountType.Student);
        assertThat(accountRepository.existsByType(AccountType.Administrator)).isFalse();
    }

}
