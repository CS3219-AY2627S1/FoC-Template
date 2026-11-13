package sg.edu.nus.foc.order.adapter;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import sg.edu.nus.foc.order.application.BackgroundRepostChecks;

@Component
@ConditionalOnProperty(name = "order.peers.mode", havingValue = "mock", matchIfMissing = true)
public class MockBackgroundRepostChecks implements BackgroundRepostChecks {
    @Override
    public boolean fundingReady(String originalOrderId, String requesterId) {
        return true;
    }

    @Override
    public void validate(String requesterId, String pickup, String delivery) {
        // Explicit mock mode only. Cloud deployments use the real HTTP provider.
    }
}
