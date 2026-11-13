package sg.edu.nus.foc.order.messagingpublisher.interfaces;

import sg.edu.nus.foc.order.messagingpublisher.dto.PenaltyScoreDeductionEvent;

public interface IPenaltyScoreDeductionPublisher {

    void publishPenaltyScoreDeduction(PenaltyScoreDeductionEvent event);
}
