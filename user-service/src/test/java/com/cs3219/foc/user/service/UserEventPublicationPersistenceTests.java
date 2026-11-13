package com.cs3219.foc.user.service;

import static org.assertj.core.api.Assertions.*;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.cs3219.foc.user.exception.EntityAlreadyExistsException;
import com.cs3219.foc.user.infrastructure.messaging.producer.SnsUserCreatedEventPublisher;
import com.cs3219.foc.user.integration.AbstractIntegrationTest;
import com.cs3219.foc.user.mapper.UserMapper;
import com.cs3219.foc.user.model.dto.RegisterUserRequest;
import com.cs3219.foc.user.model.dto.event.UserCreatedEvent;
import com.cs3219.foc.user.repository.UserRepository;
import com.cs3219.foc.user.security.CurrentUserService;
import java.time.Duration;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.modulith.events.FailedEventPublications;
import org.springframework.modulith.events.ResubmissionOptions;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.util.AopTestUtils;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest(
        classes = UserEventPublicationPersistenceTests.TestConfig.class,
        properties = {
            "spring.cloud.aws.s3.enabled=false",
            "spring.cloud.aws.sns.enabled=false",
            "spring.cloud.aws.sqs.enabled=false"
        })
class UserEventPublicationPersistenceTests extends AbstractIntegrationTest {

    @Autowired
    private UserService userService;

    @Autowired
    private SnsUserCreatedEventPublisher publisher;

    @Autowired
    private FailedEventPublications publications;

    @Autowired
    private DataSource dataSource;

    @Autowired
    private JpaTransactionManager transactionManager;

    private JdbcTemplate jdbc;

    @BeforeEach
    void clean() {
        publisher = AopTestUtils.getUltimateTargetObject(publisher);
        reset(publisher);
        jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("TRUNCATE event_publication, refresh_tokens, users CASCADE");
    }

    private UUID register() {
        return UUID.fromString(userService
                .registerUser(new RegisterUserRequest(UUID.randomUUID() + "@u.nus.edu", "Test", "password123"))
                .id());
    }

    private void awaitState(String state) {
        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> assertThat(jdbc.queryForObject(
                        "SELECT count(*) FROM event_publication WHERE status = ?", Long.class, state))
                .isEqualTo(1));
    }

    private void awaitPublicationCompleted() {
        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> assertThat(
                        jdbc.queryForObject("SELECT count(*) FROM event_publication", Long.class))
                .isZero());
    }

    @Test
    void registrationRecordsPublicationAndDeliversAfterCommit() {
        var user = register();
        awaitPublicationCompleted();
        var captor = ArgumentCaptor.forClass(UserCreatedEvent.class);
        verify(publisher).publish(captor.capture());
        assertThat(captor.getValue().payload().userId()).isEqualTo(user);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM users WHERE id = ?", Long.class, user))
                .isEqualTo(1);
    }

    @Test
    void adminInitializationRecordsPublicationAndDeliversAfterCommit() {
        var email = UUID.randomUUID() + "@u.nus.edu";
        assertThat(userService.initializeAdmin(new RegisterUserRequest(email, "Admin", "password123")))
                .isTrue();
        awaitPublicationCompleted();
        var captor = ArgumentCaptor.forClass(UserCreatedEvent.class);
        verify(publisher).publish(captor.capture());
        var userId = captor.getValue().payload().userId();
        assertThat(jdbc.queryForObject(
                        "SELECT count(*) FROM users WHERE id = ? AND email_verified", Long.class, userId))
                .isEqualTo(1);
    }

    @Test
    void preservingAnExistingAdminPublishesNothing() {
        var email = UUID.randomUUID() + "@u.nus.edu";
        assertThat(userService.initializeAdmin(new RegisterUserRequest(email, "Admin", "password123")))
                .isTrue();
        awaitPublicationCompleted();
        reset(publisher);

        assertThat(userService.initializeAdmin(new RegisterUserRequest(email, "Changed", "replacement123")))
                .isFalse();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM event_publication", Long.class))
                .isZero();
        verifyNoInteractions(publisher);
    }

    @Test
    void rejectingAnExistingNonAdminPublishesNothing() {
        var email = UUID.randomUUID() + "@u.nus.edu";
        userService.registerUser(new RegisterUserRequest(email, "Test", "password123"));
        awaitPublicationCompleted();
        reset(publisher);

        assertThatThrownBy(() -> userService.initializeAdmin(new RegisterUserRequest(email, "Admin", "password123")))
                .isInstanceOf(EntityAlreadyExistsException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM event_publication", Long.class))
                .isZero();
        verifyNoInteractions(publisher);
    }

    @Test
    void registrationRollbackLeavesNoUserOrPublication() {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            register();
            status.setRollbackOnly();
        });
        assertThat(jdbc.queryForObject("SELECT count(*) FROM users", Long.class))
                .isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM event_publication", Long.class))
                .isZero();
        verifyNoInteractions(publisher);
    }

    @Test
    void publicationWriteFailureRollsBackRegistration() {
        jdbc.execute("ALTER TABLE event_publication ADD CONSTRAINT fail_publication CHECK (false) NOT VALID");
        try {
            assertThatThrownBy(this::register).isInstanceOf(RuntimeException.class);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM users", Long.class))
                    .isZero();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM event_publication", Long.class))
                    .isZero();
            verifyNoInteractions(publisher);
        } finally {
            jdbc.execute("ALTER TABLE event_publication DROP CONSTRAINT fail_publication");
        }
    }

    @Test
    void failedPublicationRetriesWithSameEventIdentity() {
        doThrow(new IllegalStateException("Broker unavailable")).when(publisher).publish(any());
        register();
        awaitState("FAILED");
        doNothing().when(publisher).publish(any());
        publications.resubmit(ResubmissionOptions.defaults());
        awaitPublicationCompleted();
        var captor = ArgumentCaptor.forClass(UserCreatedEvent.class);
        verify(publisher, times(2)).publish(captor.capture());
        var first = captor.getAllValues().getFirst();
        var retried = captor.getAllValues().getLast();
        assertThat(retried.eventId()).isEqualTo(first.eventId());
        assertThat(retried.payload()).isEqualTo(first.payload());
        assertThat(retried.occurredAt().toInstant())
                .isEqualTo(first.occurredAt().toInstant());
    }

    @Configuration
    @EnableAutoConfiguration
    @AutoConfigurationPackage(basePackages = "com.cs3219.foc.user")
    @EnableAsync
    @EnableTransactionManagement
    @EnableJpaRepositories(basePackageClasses = UserRepository.class)
    static class TestConfig {
        @Bean
        SnsUserCreatedEventPublisher publisher() {
            return mock(SnsUserCreatedEventPublisher.class);
        }

        @Bean
        UserService userService(UserRepository repository, ApplicationEventPublisher events) {
            return new UserService(
                    repository,
                    new BCryptPasswordEncoder(4),
                    Mappers.getMapper(UserMapper.class),
                    events,
                    mock(EmailVerificationService.class),
                    mock(EmailChangeService.class),
                    mock(AvatarStorageService.class),
                    mock(CurrentUserService.class));
        }
    }
}
