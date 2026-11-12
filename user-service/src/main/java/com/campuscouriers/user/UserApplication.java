/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user;

import com.campuscouriers.user.bootstrap.AdminBootstrapRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;

import java.time.Clock;

@SpringBootApplication
public class UserApplication {

	@Bean
	Clock clock() {
		return Clock.systemUTC();
	}

	public static void main(String[] args) {
		ConfigurableApplicationContext context = SpringApplication.run(UserApplication.class, args);

		// Bootstrap-only job: the administrator bootstrap has run (a failure would have thrown above), so shut down
		if (context.getEnvironment().matchesProfiles(AdminBootstrapRunner.BOOTSTRAP_ONLY_PROFILE)) {
			System.exit(SpringApplication.exit(context));
		}
	}

}
