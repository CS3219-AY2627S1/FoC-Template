/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Mode: Implementation.
 * Scope: Generated durable report-creation compensation implementation.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.order.adapter;

import com.google.protobuf.ByteString;
import com.google.pubsub.v1.PubsubMessage;
import java.util.concurrent.TimeUnit;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import sg.edu.nus.foc.order.application.reportcreation.*;
import sg.edu.nus.foc.order.config.ReportCreationSettings;
import sg.edu.nus.foc.order.messagingpublisher.publisher.*;
import tools.jackson.databind.json.JsonMapper;

@Component
@RequiredArgsConstructor
public class PubSubReportCreationResultPublisher implements ReportCreationResultPublisher {
    private final PubSubPublisherFactory publishers;private final JsonMapper json;private final ReportCreationSettings settings;
    @Override public void publish(ReportCreationMessages.Result result){
        if(!settings.enabled())throw new EventPublicationException("Report creation compensation is disabled.");
        try{
            var message=PubsubMessage.newBuilder().setData(ByteString.copyFrom(json.writeValueAsBytes(result)))
                    .putAttributes("eventId",result.eventId()).putAttributes("eventType","ReportCreationCompensationResult")
                    .putAttributes("eventVersion","1").build();
            publishers.forTopic(settings.project(),settings.resultTopic()).publish(message).get(settings.publishTimeout().toMillis(),TimeUnit.MILLISECONDS);
        }catch(InterruptedException e){Thread.currentThread().interrupt();throw new EventPublicationException("Creation result publication interrupted.",e);}
        catch(Exception e){throw new EventPublicationException("Creation result publication failed.",e);}
    }
}
