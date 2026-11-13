package com.friendoncampus.user.config;

import java.time.Clock;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.friendoncampus.user.service.DisabledPasswordResetMailer;
import com.friendoncampus.user.service.PasswordResetMailer;
import com.friendoncampus.user.service.SendGridPasswordResetMailer;
import com.friendoncampus.user.service.EmailVerificationMailer;
import com.friendoncampus.user.service.DisabledEmailVerificationMailer;
import com.friendoncampus.user.service.SendGridEmailVerificationMailer;

@Configuration
@EnableConfigurationProperties(MailProperties.class)
public class PasswordResetConfiguration {
    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    @ConditionalOnProperty(name = "app.mail.provider", havingValue = "sendgrid")
    PasswordResetMailer sendGridPasswordResetMailer(MailProperties properties) {
        return new SendGridPasswordResetMailer(properties.sendgridApiKey(), properties.fromEmail());
    }

    @Bean
    @ConditionalOnMissingBean(PasswordResetMailer.class)
    PasswordResetMailer disabledPasswordResetMailer() {
        return new DisabledPasswordResetMailer();
    }

    @Bean
    @ConditionalOnProperty(name = "app.mail.provider", havingValue = "sendgrid")
    EmailVerificationMailer sendGridEmailVerificationMailer(MailProperties properties) {
        return new SendGridEmailVerificationMailer(properties.sendgridApiKey(), properties.fromEmail());
    }

    @Bean
    @ConditionalOnMissingBean(EmailVerificationMailer.class)
    EmailVerificationMailer disabledEmailVerificationMailer() {
        return new DisabledEmailVerificationMailer();
    }
}
