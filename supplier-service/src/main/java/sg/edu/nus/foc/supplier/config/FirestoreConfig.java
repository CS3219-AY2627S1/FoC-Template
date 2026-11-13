package sg.edu.nus.foc.supplier.config;

import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.FirestoreOptions;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class FirestoreConfig {

    /**
     * Uses Application Default Credentials in the cloud (the Cloud Run service identity) and
     * unauthenticated emulator access when {@code FIRESTORE_EMULATOR_HOST} is set.
     */
    @Bean(destroyMethod = "close")
    Firestore firestore(SupplierProperties properties) {
        var settings = properties.firestore();
        var builder = FirestoreOptions.newBuilder()
                .setProjectId(settings.projectId())
                .setDatabaseId(settings.databaseId());
        if (!settings.emulatorHost().isEmpty()) {
            builder.setEmulatorHost(settings.emulatorHost());
        }
        return builder.build().getService();
    }
}
