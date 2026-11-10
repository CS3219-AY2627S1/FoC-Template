package sg.edu.nus.foc.common.penalty;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class PenaltySystemPolicyTest {

    @ParameterizedTest
    @CsvSource({
            "ACCEPTED_TASK_CANCELLATION, 2",
            "OVERDUE_DELIVERY, 1",
            "SUCCESSFUL_DELIVERY, 1",
            "WRONG_LOCATION_DELIVERY, 4",
            "ITEM_MISHANDLING_OR_DAMAGE, 4",
            "DELIBERATE_ITEM_RETENTION_OR_THEFT, 10",
            "COURIER_UNRESPONSIVE, 3",
            "COURIER_BAD_ATTITUDE, 2"
    })
    void preservesPublishedReasonNamesAndApprovedPositiveAmounts(String reason, int amount) {
        PenaltySystemPolicy policy = PenaltySystemPolicy.valueOf(reason);

        assertEquals(reason, policy.name());
        assertEquals(amount, policy.getPenaltyAmount());
    }

    @Test
    void refusesUnknownReasonInsteadOfSilentlySelectingAPenalty() {
        assertThrows(IllegalArgumentException.class,
                () -> PenaltySystemPolicy.valueOf("UNKNOWN_DELIVERY"));
    }

    @Test
    void badAttitudeRemainsReadableButCannotBeNewlySelected() {
        PenaltySystemPolicy policy = PenaltySystemPolicy.valueOf("COURIER_BAD_ATTITUDE");
        assertEquals(2, policy.getPenaltyAmount());
        assertFalse(PenaltySystemPolicy.getCourierPenaltyCases().contains(policy));
        assertFalse(PenaltySystemPolicy.getFullPenaltyPolicy().contains(policy));
        assertTrue(PenaltySystemPolicy.getCourierPenaltyCases().contains(PenaltySystemPolicy.COURIER_UNRESPONSIVE));
    }

    @Test
    void successfulDeliveryRewardReturnsTheSuccessfulPolicy() {
        assertEquals(PenaltySystemPolicy.SUCCESSFUL_DELIVERY,
                PenaltySystemPolicy.getSuccessfulDeliveryReward());
        assertEquals(1, PenaltySystemPolicy.getSuccessfulDeliveryReward().getPenaltyAmount());
    }

    @Test
    void courierPenaltyCasesExcludeTheThreeAutomaticOrderOutcomes() {
        assertEquals(List.of(
                PenaltySystemPolicy.COURIER_UNRESPONSIVE,
                PenaltySystemPolicy.WRONG_LOCATION_DELIVERY,
                PenaltySystemPolicy.ITEM_MISHANDLING_OR_DAMAGE,
                PenaltySystemPolicy.DELIBERATE_ITEM_RETENTION_OR_THEFT),
                PenaltySystemPolicy.getCourierPenaltyCases());
    }

    @Test
    void fullPenaltyPolicyIncludesAllCasesInDeclarationOrder() {
        assertEquals(List.of(
                PenaltySystemPolicy.ACCEPTED_TASK_CANCELLATION,
                PenaltySystemPolicy.OVERDUE_DELIVERY,
                PenaltySystemPolicy.SUCCESSFUL_DELIVERY,
                PenaltySystemPolicy.WRONG_LOCATION_DELIVERY,
                PenaltySystemPolicy.ITEM_MISHANDLING_OR_DAMAGE,
                PenaltySystemPolicy.DELIBERATE_ITEM_RETENTION_OR_THEFT,
                PenaltySystemPolicy.COURIER_UNRESPONSIVE),
                PenaltySystemPolicy.getFullPenaltyPolicy());
    }

    @Test
    void callersCannotMutateTheReturnedPolicyLists() {
        assertThrows(UnsupportedOperationException.class,
                () -> PenaltySystemPolicy.getCourierPenaltyCases().clear());
        assertThrows(UnsupportedOperationException.class,
                () -> PenaltySystemPolicy.getFullPenaltyPolicy().clear());
    }
}
