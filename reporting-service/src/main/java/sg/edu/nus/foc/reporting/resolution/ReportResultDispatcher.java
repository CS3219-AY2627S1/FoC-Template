/* AI Assistance Disclosure: OpenAI Codex, 2026-10-29. Durable leased result publishing; review pending. */
package sg.edu.nus.foc.reporting.resolution;

import com.google.api.gax.core.NoCredentialsProvider;
import com.google.api.gax.grpc.GrpcTransportChannel;
import com.google.api.gax.rpc.FixedTransportChannelProvider;
import com.google.cloud.pubsub.v1.Publisher;
import com.google.protobuf.ByteString;
import com.google.pubsub.v1.PubsubMessage;
import com.google.pubsub.v1.TopicName;
import io.grpc.ManagedChannelBuilder;
import java.util.concurrent.TimeUnit;
import org.slf4j.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import sg.edu.nus.foc.reporting.report.ReportResolutionStore;
import sg.edu.nus.foc.reporting.resolution.ResolutionMessages.Result;
import tools.jackson.databind.json.JsonMapper;

@Service
public class ReportResultDispatcher {
    private static final Logger log = LoggerFactory.getLogger(ReportResultDispatcher.class);
    private final ReportResolutionStore store;
    private final ResolutionSettings settings;
    private final JsonMapper json;
    public ReportResultDispatcher(ReportResolutionStore store, ResolutionSettings settings, JsonMapper json) {
        this.store=store; this.settings=settings; this.json=json;
    }
    @Scheduled(cron="${REPORT_RESULT_RECOVERY_CRON:0 * * * * *}")
    public void recover() {
        if (!settings.enabled()) return;
        try { for (String id : store.due()) dispatch(id); }
        catch (RuntimeException e) { log.error("Report compensation result scan failed", e); }
    }
    public void dispatch(String id) {
        if (!settings.enabled()) return;
        try { store.claim(id).ifPresent(claim -> {
            try {
                Result result = json.readValue(claim.payload(), Result.class);
                publish(result, claim.payload()); store.finish(claim, true);
                log.info("Report compensation result published eventId={} commandId={} outcome={}", result.eventId(), result.commandId(), result.outcome());
            } catch (Exception e) {
                if (e instanceof InterruptedException) Thread.currentThread().interrupt();
                store.finish(claim, false);
                log.warn("Report compensation result {} publish failed, attempt {}", id, claim.attempt(), e);
            }
        }); } catch (RuntimeException e) { log.error("Report compensation result {} dispatch failed", id, e); }
    }
    protected void publish(Result result, String payload) throws Exception {
        String topic = settings.resultTopic().startsWith("projects/") ? settings.resultTopic()
                : TopicName.of(settings.project(), settings.resultTopic()).toString();
        var builder = Publisher.newBuilder(topic);
        io.grpc.ManagedChannel channel = null;
        Publisher publisher = null;
        try {
            if (!settings.emulatorHost().isBlank()) {
                channel = ManagedChannelBuilder.forTarget(settings.emulatorHost()).usePlaintext().build();
                builder.setChannelProvider(FixedTransportChannelProvider.create(GrpcTransportChannel.create(channel)))
                        .setCredentialsProvider(NoCredentialsProvider.create());
            }
            publisher = builder.build();
            publisher.publish(PubsubMessage.newBuilder().setData(ByteString.copyFromUtf8(payload))
                    .putAttributes("eventId", result.eventId()).putAttributes("eventType", "ReportResolutionCompensationResult")
                    .putAttributes("eventVersion", "1").build()).get(15, TimeUnit.SECONDS);
        } finally {
            if (publisher != null) { publisher.shutdown(); publisher.awaitTermination(5, TimeUnit.SECONDS); }
            if (channel != null) channel.shutdownNow();
        }
    }
}
