/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated Reporting Service code for the team-specified reporting, association, storage, security, and administration contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.config;

import java.time.Clock;
import com.google.cloud.NoCredentials;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.FirestoreOptions;
import com.google.cloud.storage.Storage;
import com.google.cloud.storage.StorageOptions;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class ServiceConfig {
    @Bean Clock clock() { return Clock.systemUTC(); }

    @Bean(destroyMethod = "close")
    Firestore firestore(ReportingProperties properties) {
        var config = properties.firestore();
        var builder = FirestoreOptions.newBuilder().setProjectId(config.projectId()).setDatabaseId(config.databaseId());
        if (!config.emulatorHost().isEmpty()) builder.setEmulatorHost(config.emulatorHost());
        return builder.build().getService();
    }

    @Bean
    Storage objectStorage(ReportingProperties properties) {
        var config = properties.storage();
        var builder = StorageOptions.newBuilder().setProjectId(config.projectId());
        if (!config.emulatorHost().isEmpty()) {
            builder.setHost(config.emulatorHost()).setCredentials(NoCredentials.getInstance());
        }
        return builder.build().getService();
    }
}
