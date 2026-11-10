/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Mode: Implementation.
 * Scope: Generated durable report-creation compensation implementation.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.creation;

import com.google.api.gax.core.NoCredentialsProvider;
import com.google.api.gax.grpc.GrpcTransportChannel;
import com.google.api.gax.rpc.FixedTransportChannelProvider;
import com.google.cloud.pubsub.v1.Publisher;
import com.google.protobuf.ByteString;
import com.google.pubsub.v1.PubsubMessage;
import com.google.pubsub.v1.TopicName;
import io.grpc.ManagedChannel;
import io.grpc.ManagedChannelBuilder;
import java.util.concurrent.TimeUnit;
import org.slf4j.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import sg.edu.nus.foc.reporting.report.ReportCreationCoordinator;
import sg.edu.nus.foc.reporting.report.ReportSubmissionStore;
import tools.jackson.databind.json.JsonMapper;

@Service
public class CreationCompensationDispatcher {
    private static final Logger log=LoggerFactory.getLogger(CreationCompensationDispatcher.class);
    private final ReportSubmissionStore store; private final ReportCreationCoordinator coordinator;
    private final CreationSettings settings; private final JsonMapper json;
    public CreationCompensationDispatcher(ReportSubmissionStore store,ReportCreationCoordinator coordinator,
            CreationSettings settings,JsonMapper json){this.store=store;this.coordinator=coordinator;this.settings=settings;this.json=json;}

    @Scheduled(cron="${REPORT_CREATION_RECOVERY_CRON:0 * * * * *}")
    public void recover(){
        if(!settings.enabled()) return;
        coordinator.recoverExpired();
        for(String id:store.dueOutbox()) dispatch(id);
    }
    public void dispatch(String id){
        if(!settings.enabled()) return;
        store.claim(id).ifPresent(claim->{
            try{var event=json.readValue(claim.payload(),CreationCompensationMessages.Request.class);publish(event,claim.payload());store.finish(claim,true);}
            catch(Exception failure){if(failure instanceof InterruptedException)Thread.currentThread().interrupt();store.finish(claim,false);log.warn("Creation compensation {} publish failed",id,failure);}
        });
    }
    protected void publish(CreationCompensationMessages.Request event,String payload)throws Exception{
        String topic=settings.requestTopic().startsWith("projects/")?settings.requestTopic():TopicName.of(settings.project(),settings.requestTopic()).toString();
        var builder=Publisher.newBuilder(topic); ManagedChannel channel=null; Publisher publisher=null;
        try{
            if(!settings.emulatorHost().isBlank()){channel=ManagedChannelBuilder.forTarget(settings.emulatorHost()).usePlaintext().build();builder.setChannelProvider(FixedTransportChannelProvider.create(GrpcTransportChannel.create(channel))).setCredentialsProvider(NoCredentialsProvider.create());}
            publisher=builder.build();publisher.publish(PubsubMessage.newBuilder().setData(ByteString.copyFromUtf8(payload))
                    .putAttributes("eventId",event.eventId()).putAttributes("eventType","ReportCreationCompensationRequested")
                    .putAttributes("eventVersion","1").build()).get(15,TimeUnit.SECONDS);
        }finally{if(publisher!=null){publisher.shutdown();publisher.awaitTermination(5,TimeUnit.SECONDS);}if(channel!=null)channel.shutdownNow();}
    }
}
