/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-10-09 to 2026-10-15
 * Scope (AI-24): Generated code, configuration and tests for the specified user event, Kafka setup and outbox changes.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.event;

import com.campuscouriers.user.auth.AuthService;
import com.campuscouriers.user.auth.dto.RegisterRequest;
import com.campuscouriers.user.entity.Account;
import com.campuscouriers.user.exception.EmailAlreadyRegisteredException;
import com.campuscouriers.user.repository.AccountRepository;
import com.campuscouriers.user.repository.OutboxEventRepository;
import com.campuscouriers.user.repository.ProfileRepository;
import com.campuscouriers.user.repository.RefreshTokenRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;

import static com.campuscouriers.user.TestConstants.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

// Runs against real PostgreSQL to check what Debezium will relay: exactly the outbox rows of committed changes,
// in the column layout its Outbox Event Router expects. Add a @Nested class per event type.
@SpringBootTest
@ActiveProfiles("test")
@Testcontainers
class UserEventOutboxIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void configureProps(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired private AuthService authService;
    @Autowired private AccountRepository accountRepository;
    @Autowired private RefreshTokenRepository refreshTokenRepository;
    @Autowired private OutboxEventRepository outboxEventRepository;
    @Autowired private JdbcTemplate jdbcTemplate;
    @MockitoSpyBean private ProfileRepository profileRepository;

    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    @AfterEach
    void cleanUp() {
        outboxEventRepository.deleteAll();
        refreshTokenRepository.deleteAll();
        profileRepository.deleteAll();
        accountRepository.deleteAll();
    }

    @Test
    void outboxTable_hasTheColumnsDebeziumRoutesOn() {
        List<String> columns = jdbcTemplate.queryForList(
                "select column_name || ':' || data_type from information_schema.columns where table_name = 'outbox'",
                String.class);

        assertThat(columns).contains(
                "id:uuid", "aggregatetype:character varying", "aggregateid:character varying",
                "type:character varying", "payload:jsonb");
    }

    @DisplayName("UserRegisteredEvent")
    @Nested
    class UserRegisteredEventTests {

        @Test
        void register_storesOneEventKeyedByUserIdWithPlainJsonPayload() {
            authService.register(new RegisterRequest(VALID_NAME, DUPLICATE_EMAIL, VALID_PASSWORD));
            Account account = accountRepository.findByEmail(VALID_EMAIL).orElseThrow();

            List<OutboxEvent> events = outboxEventRepository.findByAggregateId(account.getId().toString());
            assertThat(events).hasSize(1);
            OutboxEvent event = events.get(0);
            assertThat(event.getAggregateType()).isEqualTo("user");
            assertThat(event.getType()).isEqualTo("user.registered");

            // Read back from the jsonb column, as Debezium sees it
            JsonNode payload = jsonMapper.readTree(jdbcTemplate.queryForObject(
                    "select payload::text from outbox where id = ?", String.class, event.getId()));
            assertThat(payload.get("userId").asString()).isEqualTo(account.getId().toString());
            assertThat(payload.get("type").asString()).isEqualTo("Student");
            assertThat(payload.get("name").asString()).isEqualTo(VALID_NAME);
            assertThat(payload.get("email").asString()).isEqualTo(VALID_EMAIL);
            assertThat(payload.get("registeredAt").isString()).isTrue();
        }

        @Test
        void register_withDuplicateEmail_storesOnlyOneEvent() {
            authService.register(new RegisterRequest(VALID_NAME, VALID_EMAIL, VALID_PASSWORD));
            assertThatThrownBy(() -> authService.register(new RegisterRequest(VALID_NAME, VALID_EMAIL, VALID_PASSWORD)))
                    .isInstanceOf(EmailAlreadyRegisteredException.class);

            assertThat(outboxEventRepository.count()).isEqualTo(1);
        }

        @Test
        void register_whenProfileSaveFails_rollsBackAccountAndEvent() {
            doThrow(new IllegalStateException("database down")).when(profileRepository).save(any());

            assertThatThrownBy(() -> authService.register(new RegisterRequest(VALID_NAME, VALID_EMAIL, VALID_PASSWORD)))
                    .isInstanceOf(IllegalStateException.class);

            assertThat(accountRepository.count()).isZero();
            assertThat(outboxEventRepository.count()).isZero();
        }
    }

}
