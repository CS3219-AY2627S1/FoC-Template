package com.cs3219.foc.user.config;

import com.cs3219.foc.user.model.dto.RegisterUserRequest;
import com.cs3219.foc.user.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.validation.Validator;

@Slf4j
@Component
@Profile("admin-init")
@RequiredArgsConstructor
public class AdminInitializationRunner implements ApplicationRunner {
    private final UserService userService;
    private final InitialAdminProperties properties;
    private final ConfigurableApplicationContext context;
    private final Validator validator;

    @Override
    public void run(ApplicationArguments args) {
        var request = new RegisterUserRequest(properties.email(), properties.name(), properties.password());

        var errors = validator.validateObject(request);
        if (errors.hasErrors()) {
            errors.getFieldErrors()
                    .forEach(error ->
                            log.error("Invalid initial admin {}: {}", error.getField(), error.getDefaultMessage()));

            System.exit(SpringApplication.exit(context, () -> 1));
        }

        var isAdminCreated = userService.initializeAdmin(request);

        if (isAdminCreated) {
            log.info("Initial admin created with email: {}", properties.email());
        } else {
            log.info("Admin already exists. Account is preserved.");
        }

        System.exit(SpringApplication.exit(context));
    }
}
