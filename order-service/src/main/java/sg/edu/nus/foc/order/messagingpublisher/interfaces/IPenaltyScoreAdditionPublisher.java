package sg.edu.nus.foc.order.messagingpublisher.interfaces;

import sg.edu.nus.foc.order.messagingpublisher.dto.PenaltyScoreAdditionEvent;

public interface IPenaltyScoreAdditionPublisher {

    void publishPenaltyScoreAddition(PenaltyScoreAdditionEvent event);
}
