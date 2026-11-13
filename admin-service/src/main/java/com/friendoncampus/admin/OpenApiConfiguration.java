package com.friendoncampus.admin;

import org.springframework.context.annotation.Configuration;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.security.SecurityScheme;

@Configuration
@SecurityScheme(name = "userBearer", type = SecuritySchemeType.HTTP, scheme = "bearer", bearerFormat = "User JWT")
@SecurityScheme(name = "serviceBearer", type = SecuritySchemeType.HTTP, scheme = "bearer", bearerFormat = "Service JWT")
class OpenApiConfiguration { }
