package com.friendoncampus.user.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.domain.UserRole;
import com.friendoncampus.user.domain.UserStatus;
import com.friendoncampus.user.repository.UserRepository;
import com.friendoncampus.user.support.JwtTestProperties;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:adminlifecycle;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000",
        "spring.datasource.driver-class-name=org.h2.Driver", "spring.datasource.username=sa", "spring.datasource.password=" })
class AdminLifecycleConcurrencyIntegrationTest {
    @Autowired AdminLifecycleService lifecycle;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate jdbc;

    @DynamicPropertySource
    static void jwtProperties(DynamicPropertyRegistry registry) {
        JwtTestProperties.register(registry);
    }

    @BeforeEach
    void resetDatabase() {
        jdbc.update("UPDATE admin_bootstrap_state SET completed_at = NULL, admin_id = NULL WHERE id = 'FIRST_ADMIN'");
        jdbc.update("DELETE FROM email_verification_attempts");
        jdbc.update("DELETE FROM password_reset_tokens");
        jdbc.update("DELETE FROM users");
    }

    @Test
    void concurrentCrossDemotionsLeaveOneActiveAdministrator() throws Exception {
        User first = activeAdmin("first@u.nus.edu", "First", "first");
        User second = activeAdmin("second@u.nus.edu", "Second", "second");
        users.save(first);
        users.save(second);

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Callable<Boolean> firstDemotesSecond = () -> attemptDemotion(first, second);
            Callable<Boolean> secondDemotesFirst = () -> attemptDemotion(second, first);
            Future<Boolean> firstResult = pool.submit(firstDemotesSecond);
            Future<Boolean> secondResult = pool.submit(secondDemotesFirst);
            assertThat(firstResult.get(10, TimeUnit.SECONDS) ^ secondResult.get(10, TimeUnit.SECONDS)).isTrue();
        } finally {
            pool.shutdownNow();
        }

        assertThat(users.countByRolesContainingAndStatus(UserRole.ADMIN, UserStatus.ACTIVE)).isEqualTo(1);
    }

    private boolean attemptDemotion(User actor, User target) {
        try {
            lifecycle.demote(actor.getId(), target.getId());
            return true;
        } catch (AdminAccessDeniedException | AdminLifecycleException expected) {
            return false;
        }
    }

    private User activeAdmin(String email, String username, String normalizedUsername) {
        User user = User.register(email, username, normalizedUsername, "hash");
        user.activate();
        user.promoteToAdmin();
        return user;
    }
}
