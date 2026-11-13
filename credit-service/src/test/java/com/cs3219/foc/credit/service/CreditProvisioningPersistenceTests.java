package com.cs3219.foc.credit.service;

import static org.assertj.core.api.Assertions.*;

import com.cs3219.foc.credit.config.CreditProperties;
import com.cs3219.foc.credit.infrastructure.messaging.consumer.UserCreatedConsumer;
import com.cs3219.foc.credit.integration.AbstractIntegrationTest;
import com.cs3219.foc.credit.model.dto.CreditBalanceResponse;
import com.cs3219.foc.credit.model.dto.event.UserCreatedEvent;
import com.cs3219.foc.credit.repository.CreditAccountRepository;
import com.cs3219.foc.credit.security.AuthenticatedUserResolver;
import com.cs3219.foc.credit.security.AuthenticationContextService;
import com.cs3219.foc.credit.security.CurrentUserService;
import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@Import(CreditProvisioningPersistenceTests.TestConfig.class)
class CreditProvisioningPersistenceTests extends AbstractIntegrationTest {

    @Autowired
    private UserCreatedConsumer userCreatedConsumer;

    @Autowired
    private CreditAccountService creditAccountService;

    @Autowired
    private CreditAccountRepository accountRepository;

    @Autowired
    private DataSource dataSource;

    private JdbcTemplate jdbc;

    @BeforeEach
    void clean() {
        jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("TRUNCATE credit_accounts CASCADE");
    }

    private UserCreatedEvent event(UUID userId) {
        return new UserCreatedEvent(UUID.randomUUID(), 1, OffsetDateTime.now(), new UserCreatedEvent.Payload(userId));
    }

    @Test
    void consumerReturnsOnlyAfterAccountCommitted() {
        var event = event(UUID.randomUUID());
        userCreatedConsumer.initializeAccount(event);
        assertThat(jdbc.queryForObject(
                        "SELECT count(*) FROM credit_accounts WHERE user_id = ?",
                        Long.class,
                        event.payload().userId()))
                .isEqualTo(1);
        assertThat(creditAccountService.getBalance(event.payload().userId()))
                .isEqualTo(new CreditBalanceResponse(15, 0));
    }

    @Test
    void duplicateEventAndDifferentEventForSameUserPreserveBalance() {
        var event = event(UUID.randomUUID());
        userCreatedConsumer.initializeAccount(event);
        jdbc.update(
                "UPDATE credit_accounts SET total_balance = 35 WHERE user_id = ?",
                event.payload().userId());
        userCreatedConsumer.initializeAccount(event);
        userCreatedConsumer.initializeAccount(event(event.payload().userId()));
        assertThat(creditAccountService.getBalance(event.payload().userId()))
                .isEqualTo(new CreditBalanceResponse(35, 0));
        assertThat(accountRepository.count()).isEqualTo(1);
    }

    @Test
    void commitFailureReachesConsumerAndRedeliverySucceeds() {
        var event = event(UUID.randomUUID());
        jdbc.execute(
                "CREATE FUNCTION fail_provisioning_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Simulated commit failure'; END $$");
        jdbc.execute(
                "CREATE CONSTRAINT TRIGGER fail_provisioning_commit AFTER INSERT ON credit_accounts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fail_provisioning_commit()");
        try {
            assertThatThrownBy(() -> userCreatedConsumer.initializeAccount(event))
                    .isInstanceOf(RuntimeException.class);
            assertThat(accountRepository.count()).isZero();
        } finally {
            jdbc.execute("DROP TRIGGER fail_provisioning_commit ON credit_accounts");
            jdbc.execute("DROP FUNCTION fail_provisioning_commit()");
        }
        userCreatedConsumer.initializeAccount(event);
        assertThat(accountRepository.count()).isEqualTo(1);
    }

    @Test
    void concurrentDuplicateDeliveriesCreateOneAccount() throws Exception {
        var event = event(UUID.randomUUID());
        var barrier = new CyclicBarrier(2);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> {
                barrier.await(10, TimeUnit.SECONDS);
                userCreatedConsumer.initializeAccount(event);
                return true;
            });
            var second = executor.submit(() -> {
                barrier.await(10, TimeUnit.SECONDS);
                userCreatedConsumer.initializeAccount(event(event.payload().userId()));
                return true;
            });
            assertThat(first.get(20, TimeUnit.SECONDS)).isTrue();
            assertThat(second.get(20, TimeUnit.SECONDS)).isTrue();
        }
        assertThat(accountRepository.count()).isEqualTo(1);
        assertThat(creditAccountService.getBalance(event.payload().userId()))
                .isEqualTo(new CreditBalanceResponse(15, 0));
    }

    @TestConfiguration
    @EnableConfigurationProperties(CreditProperties.class)
    @EnableTransactionManagement
    @EnableJpaRepositories(basePackageClasses = CreditAccountRepository.class)
    @Import({
        UserCreatedConsumer.class,
        CreditAccountService.class,
        CurrentUserService.class,
        AuthenticationContextService.class,
        AuthenticatedUserResolver.class
    })
    static class TestConfig {}
}
