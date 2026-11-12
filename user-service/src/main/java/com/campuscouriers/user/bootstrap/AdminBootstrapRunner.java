/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.bootstrap;

import com.campuscouriers.user.exception.AdminBootstrapException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

// Runs after the context (and the Hibernate schema update) is ready. A thrown exception aborts startup
@Component
@EnableConfigurationProperties(AdminBootstrapProperties.class)
public class AdminBootstrapRunner implements ApplicationRunner {

    // Activating this profile runs the bootstrap without the web server and exits (see UserApplication.main)
    public static final String BOOTSTRAP_ONLY_PROFILE = "bootstrap-admin";

    private static final Logger log = LoggerFactory.getLogger(AdminBootstrapRunner.class);

    private final AdminBootstrapService adminBootstrapService;
    private final AdminBootstrapProperties properties;
    private final Environment environment;

    public AdminBootstrapRunner(
        AdminBootstrapService adminBootstrapService,
        AdminBootstrapProperties properties,
        Environment environment
    ) {
        this.adminBootstrapService = adminBootstrapService;
        this.properties = properties;
        this.environment = environment;
    }

    @Override
    public void run(ApplicationArguments args) {
        switch (adminBootstrapService.bootstrap()) {
            case CREATED -> log.info("Created bootstrap administrator account {}", properties.email());
            case ADMIN_EXISTS -> log.info("An administrator account already exists; skipping administrator bootstrap");
            case NOT_CONFIGURED -> {
                // A bootstrap-only job without configuration is a deployment mistake, so it must not report success
                if (isBootstrapOnly()) {
                    throw new AdminBootstrapException("No administrator account exists and BOOTSTRAP_ADMIN_NAME, "
                            + "BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are not set");
                }
                log.warn("No administrator account exists and BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL and "
                        + "BOOTSTRAP_ADMIN_PASSWORD are not set. Set them and restart the service, or run the "
                        + "'{}' job, to create the first administrator", BOOTSTRAP_ONLY_PROFILE);
            }
        }
    }

    private boolean isBootstrapOnly() {
        return environment.matchesProfiles(BOOTSTRAP_ONLY_PROFILE);
    }

}
