package com.friendoncampus.supplier.storage;

import java.net.URI;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

@Configuration
public class S3SupplierImageConfiguration {

    @Bean
    @ConditionalOnProperty(name = "app.images.storage", havingValue = "s3")
    S3Client supplierImageS3Client(
            @Value("${app.images.s3.region}") String region,
            @Value("${app.images.s3.endpoint:}") String endpoint) {
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
    @ConditionalOnProperty(name = "app.images.storage", havingValue = "s3")
    SupplierImageObjectStore s3SupplierImageObjectStore(
            S3Client supplierImageS3Client,
            @Value("${app.images.s3.bucket}") String bucket,
            @Value("${app.images.s3.key-prefix}") String keyPrefix) {
        return new S3SupplierImageObjectStore(supplierImageS3Client, bucket, keyPrefix);
    }

    @Bean
    @ConditionalOnMissingBean(SupplierImageObjectStore.class)
    SupplierImageObjectStore unavailableSupplierImageObjectStore() {
        return new UnavailableSupplierImageObjectStore();
    }
}
