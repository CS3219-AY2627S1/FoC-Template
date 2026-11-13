package com.friendoncampus.user.repository;

import static org.assertj.core.api.Assertions.assertThat;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import com.friendoncampus.user.support.JwtTestProperties;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:users;MODE=PostgreSQL;DB_CLOSE_DELAY=-1","spring.datasource.driver-class-name=org.h2.Driver","spring.datasource.username=sa","spring.datasource.password="})
class UserRepositoryMigrationTest {
    @Autowired JdbcTemplate jdbc;
    @DynamicPropertySource static void jwtProperties(DynamicPropertyRegistry registry) { JwtTestProperties.register(registry); }

    @Test void flywayCreatesUserRolesPasswordResetEmailVerificationAndAdminStateTables() {
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'USER_EVENT_OUTBOX'", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'USERS'", Integer.class)).isGreaterThan(0);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'USER_ROLES'", Integer.class)).isGreaterThan(0);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PASSWORD_RESET_TOKENS'", Integer.class)).isGreaterThan(0);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PASSWORD_RESET_REQUEST_COOLDOWNS'", Integer.class)).isGreaterThan(0);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'EMAIL_VERIFICATION_ATTEMPTS'", Integer.class)).isGreaterThan(0);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ADMIN_BOOTSTRAP_STATE'", Integer.class)).isGreaterThan(0);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ADMIN_BOOTSTRAP_STATE WHERE ID = 'FIRST_ADMIN'", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ADMIN_LIFECYCLE_STATE'", Integer.class)).isGreaterThan(0);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ADMIN_LIFECYCLE_STATE WHERE ID = 'ADMIN_LIFECYCLE'", Integer.class)).isEqualTo(1);
    }
}
