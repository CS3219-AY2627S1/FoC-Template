package com.campuscouriers.credit;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import java.time.Clock;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class CreditApplication {

	@Bean
	Clock clock() {
		return Clock.systemUTC();
	}

	public static void main(String[] args) {
		SpringApplication.run(CreditApplication.class, args);
	}

}
