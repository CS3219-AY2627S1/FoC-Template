package sg.edu.nus.foc.common.penalty;

import java.util.EnumSet;
import java.util.Comparator;
import java.util.List;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum PenaltySystemPolicy {

    ACCEPTED_TASK_CANCELLATION(2),
    OVERDUE_DELIVERY(1),
    SUCCESSFUL_DELIVERY(1),

    // Report-related misconduct requires administrator confirmation (D1 NTH2).
    WRONG_LOCATION_DELIVERY(4),
    ITEM_MISHANDLING_OR_DAMAGE(4),

    // D1 additionally requires permanent suspension; this enum does not enforce it.
    DELIBERATE_ITEM_RETENTION_OR_THEFT(10),

    // Read compatibility only: existing persisted penalties and pending events must remain readable.
    @Deprecated
    COURIER_BAD_ATTITUDE(2),

    COURIER_UNRESPONSIVE(3);

    // Positive magnitude; successful delivery deducts, all other cases add.
    private final int penaltyAmount;

    public static PenaltySystemPolicy getSuccessfulDeliveryReward() {
        return SUCCESSFUL_DELIVERY;
    }

    /** Report-related cases; excludes the three automatic Order outcomes. */
    public static List<PenaltySystemPolicy> getCourierPenaltyCases() {
        EnumSet<PenaltySystemPolicy> cases = EnumSet.allOf(PenaltySystemPolicy.class);
        cases.removeAll(EnumSet.of(
                ACCEPTED_TASK_CANCELLATION,
                OVERDUE_DELIVERY,
                SUCCESSFUL_DELIVERY,
                COURIER_BAD_ATTITUDE));

        return cases.stream().sorted(Comparator.comparingInt(PenaltySystemPolicy::getPenaltyAmount)).toList();
    }

    public static List<PenaltySystemPolicy> getFullPenaltyPolicy() {
        EnumSet<PenaltySystemPolicy> active = EnumSet.allOf(PenaltySystemPolicy.class);
        active.remove(COURIER_BAD_ATTITUDE);
        return List.copyOf(active);
    }
}
