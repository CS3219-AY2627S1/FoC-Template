package com.friendoncampus.credit.demo;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import com.friendoncampus.credit.service.CreditReservationService;
import com.friendoncampus.credit.service.InitialCreditAllocationService;

@Component
@Profile("demo")
public class DemoCreditScenarioRunner implements ApplicationRunner {

    static final int RESERVED_CREDITS = 3;

    private static final Logger LOG = LoggerFactory.getLogger(DemoCreditScenarioRunner.class);

    private final UUID userId;
    private final InitialCreditAllocationService allocations;
    private final CreditReservationService reservations;

    public DemoCreditScenarioRunner(
            @Value("${CREDIT_DEMO_USER_ID}") UUID userId,
            InitialCreditAllocationService allocations,
            CreditReservationService reservations) {
        this.userId = userId;
        this.allocations = allocations;
        this.reservations = reservations;
    }

    @Override
    public void run(ApplicationArguments arguments) {
        UUID allocationOperationId = stableId("allocation", userId);
        UUID orderId = stableId("order", userId);
        UUID reservationOperationId = stableId("reservation", userId);

        allocations.allocate(allocationOperationId, userId);
        reservations.reserve(reservationOperationId, orderId, userId, RESERVED_CREDITS);

        LOG.info("Prepared opt-in credit demo scenario for user {}", userId);
    }

    static UUID stableId(String purpose, UUID userId) {
        return UUID.nameUUIDFromBytes(("foc-credit-demo:" + purpose + ":" + userId)
                .getBytes(StandardCharsets.UTF_8));
    }
}
