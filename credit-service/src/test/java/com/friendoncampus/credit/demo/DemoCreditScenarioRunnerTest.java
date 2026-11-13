package com.friendoncampus.credit.demo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;

import com.friendoncampus.credit.service.CreditReservationService;
import com.friendoncampus.credit.service.InitialCreditAllocationService;

class DemoCreditScenarioRunnerTest {

    private static final UUID USER_ID = UUID.fromString("10000000-0000-0000-0000-000000000001");

    private final InitialCreditAllocationService allocations = org.mockito.Mockito.mock(
            InitialCreditAllocationService.class);
    private final CreditReservationService reservations = org.mockito.Mockito.mock(CreditReservationService.class);

    @Test
    void preparesARepeatableAllocationAndReservationForTheConfiguredUser() {
        DemoCreditScenarioRunner runner = new DemoCreditScenarioRunner(USER_ID, allocations, reservations);

        runner.run(new DefaultApplicationArguments());

        verify(allocations).allocate(DemoCreditScenarioRunner.stableId("allocation", USER_ID), USER_ID);
        verify(reservations).reserve(
                DemoCreditScenarioRunner.stableId("reservation", USER_ID),
                DemoCreditScenarioRunner.stableId("order", USER_ID),
                USER_ID,
                DemoCreditScenarioRunner.RESERVED_CREDITS);
    }

    @Test
    void generatesStableIdsThatRemainDistinctAcrossPurposes() {
        UUID firstAllocation = DemoCreditScenarioRunner.stableId("allocation", USER_ID);

        assertThat(DemoCreditScenarioRunner.stableId("allocation", USER_ID)).isEqualTo(firstAllocation);
        assertThat(DemoCreditScenarioRunner.stableId("order", USER_ID)).isNotEqualTo(firstAllocation);
    }
}
