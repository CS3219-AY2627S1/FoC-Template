package com.friendoncampus.chat.storage;

import java.net.URI;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

@Configuration
@ConditionalOnProperty(name = "app.attachments.storage", havingValue = "s3")
public class S3AttachmentConfiguration {
    @Bean
    S3Client chatS3Client(
            @Value("${app.attachments.s3.region}") String region,
            @Value("${app.attachments.s3.endpoint:}") String endpoint) {
        var builder = S3Client.builder()
                .region(Region.of(region))
                .credentialsProvider(DefaultCredentialsProvider.create())
                .httpClientBuilder(UrlConnectionHttpClient.builder());
        if (!endpoint.isBlank()) {
            builder.endpointOverride(URI.create(endpoint)).forcePathStyle(true);
        }
        return builder.build();
    }

    @Bean
    S3AttachmentObjectStore s3AttachmentObjectStore(
            S3Client chatS3Client,
            @Value("${app.attachments.s3.bucket}") String bucket,
            @Value("${app.attachments.s3.key-prefix}") String keyPrefix) {
        return new S3AttachmentObjectStore(chatS3Client, bucket, keyPrefix);
    }
}
