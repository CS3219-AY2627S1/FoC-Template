package com.friendoncampus.credit.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.friendoncampus.credit.domain.CreditAccount;
import com.friendoncampus.credit.repository.CreditAccountRepository;

@SpringBootTest
@Testcontainers(disabledWithoutDocker = true)
class CreditReservationConcurrencyIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17-alpine");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired InitialCreditAllocationService allocations;
    @Autowired CreditReservationService reservations;
    @Autowired CreditAccountRepository accounts;

    @Test
    void concurrentReservationsCannotSpendMoreThanAvailable() throws Exception {
        UUID requesterId = UUID.randomUUID();
        allocations.allocate(UUID.randomUUID(), requesterId);

        Callable<Boolean> first = () -> tryReserve(requesterId, UUID.randomUUID());
        Callable<Boolean> second = () -> tryReserve(requesterId, UUID.randomUUID());
        List<Future<Boolean>> futures;
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            futures = executor.invokeAll(List.of(first, second));
        } finally {
            executor.shutdownNow();
        }

        assertThat(futures).extracting(Future::get).containsExactlyInAnyOrder(true, false);
        CreditAccount account = accounts.findById(requesterId).orElseThrow();
        assertThat(account.getAvailableBalance()).isEqualTo(4);
        assertThat(account.getReservedBalance()).isEqualTo(6);
    }

    private boolean tryReserve(UUID requesterId, UUID orderId) {
        try {
            reservations.reserve(UUID.randomUUID(), orderId, requesterId, 6);
            return true;
        } catch (InsufficientCreditsException exception) {
            return false;
        }
    }
}
