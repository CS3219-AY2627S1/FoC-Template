package sg.edu.nus.foc.order.adapter;

import com.google.protobuf.ByteString;
import com.google.pubsub.v1.PubsubMessage;
import java.util.concurrent.TimeUnit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import sg.edu.nus.foc.order.application.reportresolution.ReportCompensationPublisher;
import sg.edu.nus.foc.order.application.reportresolution.ReportResolutionMessages;
import sg.edu.nus.foc.order.config.ReportResolutionSettings;
import sg.edu.nus.foc.order.messagingpublisher.publisher.EventPublicationException;
import sg.edu.nus.foc.order.messagingpublisher.publisher.PubSubPublisherFactory;
import tools.jackson.databind.json.JsonMapper;

@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(name = "order.reports.resolution.enabled", havingValue = "true")
public class PubSubReportCompensationPublisher implements ReportCompensationPublisher {
    private final PubSubPublisherFactory publishers;
    private final JsonMapper json;
    private final ReportResolutionSettings settings;
    @Override public void publish(ReportResolutionMessages.Compensation event) {
        try {
            var message = PubsubMessage.newBuilder().setData(ByteString.copyFrom(json.writeValueAsBytes(event)))
                    .putAttributes("eventType", "ReportResolutionCompensationRequested")
                    .putAttributes("eventVersion", "1").putAttributes("eventId", event.eventId()).build();
            String messageId = publishers.forTopic(settings.transport().projectId(), settings.transport().requestTopic())
                    .publish(message).get(settings.timeout().toMillis(), TimeUnit.MILLISECONDS);
            log.info("Pub/Sub accepted Report compensation {} for command {}; broker message {} is not reversal confirmation.", event.eventId(), event.commandId(), messageId);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new EventPublicationException("Report compensation publication interrupted.", interrupted);
        } catch (Exception failure) {
            throw new EventPublicationException("Pub/Sub did not confirm Report compensation publication.", failure);
        }
    }
}
