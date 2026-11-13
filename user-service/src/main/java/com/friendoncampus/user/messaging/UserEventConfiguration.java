package com.friendoncampus.user.messaging;

import java.util.HashMap;
import java.util.Map;
import org.apache.kafka.clients.CommonClientConfigs;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.Producer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.config.SaslConfigs;
import org.apache.kafka.common.serialization.StringSerializer;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.EnableScheduling;
import java.time.Clock;
import io.micrometer.core.instrument.MeterRegistry;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "app.events.enabled", havingValue = "true")
@EnableConfigurationProperties(UserEventSettings.class)
@EnableScheduling
public class UserEventConfiguration {
    @Bean(destroyMethod = "close")
    @Lazy
    Producer<String, String> userEventKafkaProducer(UserEventSettings settings) {
        return new KafkaProducer<>(producerProperties(settings));
    }

    @Bean
    UserOutboxPublisher userOutboxPublisher(UserOutboxRepository outbox,
            @Lazy Producer<String, String> userEventKafkaProducer, UserEventSettings settings,
            Clock clock, MeterRegistry meters) {
        producerProperties(settings); // Validate secrets/settings without contacting or resolving the broker.
        return new UserOutboxPublisher(outbox, userEventKafkaProducer, settings, clock, meters);
    }

    @Bean
    UserEventDispatcher userEventDispatcher(UserOutboxPublisher publisher, UserEventSettings settings) {
        return new UserEventDispatcher(publisher, settings);
    }

    static Map<String, Object> producerProperties(UserEventSettings settings) {
        if (settings.bootstrapServers() == null || settings.bootstrapServers().isBlank()) {
            throw new IllegalArgumentException("Kafka bootstrap servers are required when publishing is enabled");
        }
        Map<String, Object> properties = new HashMap<>();
        properties.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, settings.bootstrapServers());
        properties.put(ProducerConfig.CLIENT_ID_CONFIG, "user-service");
        properties.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        properties.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        properties.put(ProducerConfig.ACKS_CONFIG, "all");
        properties.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        properties.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 1);
        properties.put(ProducerConfig.LINGER_MS_CONFIG, 0);
        properties.put(ProducerConfig.MAX_BLOCK_MS_CONFIG, settings.sendTimeoutMs());
        properties.put(ProducerConfig.REQUEST_TIMEOUT_MS_CONFIG, (int) Math.min(1000, settings.sendTimeoutMs()));
        properties.put(ProducerConfig.DELIVERY_TIMEOUT_MS_CONFIG, (int) settings.sendTimeoutMs());
        String protocol = settings.securityProtocol();
        if (!"SASL_PLAINTEXT".equals(protocol) && !"SASL_SSL".equals(protocol)
                && !"PLAINTEXT".equals(protocol)) {
            throw new IllegalArgumentException("Unsupported Kafka security protocol");
        }
        properties.put(CommonClientConfigs.SECURITY_PROTOCOL_CONFIG, protocol);
        if (protocol.startsWith("SASL_")) {
            String mechanism = settings.saslMechanism();
            String loginModule = switch (mechanism) {
                case "PLAIN" -> "org.apache.kafka.common.security.plain.PlainLoginModule";
                case "SCRAM-SHA-512" -> "org.apache.kafka.common.security.scram.ScramLoginModule";
                default -> throw new IllegalArgumentException("Unsupported Kafka SASL mechanism");
            };
            properties.put(SaslConfigs.SASL_MECHANISM, mechanism);
            properties.put(SaslConfigs.SASL_JAAS_CONFIG,
                    loginModule + " required username=\""
                    + jaas(settings.username()) + "\" password=\"" + jaas(settings.password()) + "\";");
        }
        return properties;
    }

    private static String jaas(String value) {
        if (value == null || value.isBlank() || value.contains("\r") || value.contains("\n")) {
            throw new IllegalArgumentException("Kafka credentials must be nonempty and contain no line breaks");
        }
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
