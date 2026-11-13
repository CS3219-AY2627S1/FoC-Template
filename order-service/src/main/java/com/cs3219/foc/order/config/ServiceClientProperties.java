package com.cs3219.foc.order.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("services")
public record ServiceClientProperties(
        @DefaultValue("http://localhost:8081/api") String supplierUrl,
        @DefaultValue("http://localhost:8080/api") String userUrl,
        @DefaultValue("http://localhost:8083/api") String creditUrl) {}
