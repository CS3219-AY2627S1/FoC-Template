package com.cs3219.foc.user.infrastructure.mail;

import com.cs3219.foc.user.config.AccountMailProperties;
import com.cs3219.foc.user.model.dto.event.EmailChangedEvent;
import com.cs3219.foc.user.model.dto.event.EmailTokenCreatedEvent;
import com.cs3219.foc.user.model.dto.event.PasswordResetCompletedEvent;
import com.cs3219.foc.user.model.entity.EmailTokenPurpose;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.util.UriComponentsBuilder;

@Component
@RequiredArgsConstructor
@Slf4j
public class AccountMailListener {
    private final JavaMailSender sender;
    private final AccountMailProperties properties;

    @TransactionalEventListener
    @Async
    public void notifyPasswordReset(PasswordResetCompletedEvent event) {
        var message = new SimpleMailMessage();
        message.setFrom(properties.from());
        message.setTo(event.email());
        message.setSubject("Your FoC password has been reset");
        message.setText(
                "Your FoC password has been reset successfully. If you did not make this change, use Forgot password to secure your account.");
        try {
            sender.send(message);
        } catch (MailException exception) {
            log.warn(
                    "Password reset notification failed for user {} ({})",
                    event.userId(),
                    exception.getClass().getSimpleName());
        }
    }

    @TransactionalEventListener
    @Async
    public void notifyEmailChanged(EmailChangedEvent event) {
        var message = new SimpleMailMessage();
        message.setFrom(properties.from());
        message.setTo(event.oldEmail());
        message.setSubject("Your FoC email address has changed");
        message.setText("Your FoC email address has been changed to %s.".formatted(event.newEmail()));
        try {
            sender.send(message);
        } catch (MailException exception) {
            log.warn(
                    "Email change notification failed for user {} ({})",
                    event.userId(),
                    exception.getClass().getSimpleName());
        }
    }

    @TransactionalEventListener
    @Async
    public void sendAccountEmail(EmailTokenCreatedEvent event) {
        var changingEmail = event.purpose() == EmailTokenPurpose.EMAIL_CHANGE;
        var linkBuilder = UriComponentsBuilder.fromUri(properties.frontendUrl())
                .replacePath(event.purpose() == EmailTokenPurpose.PASSWORD_RESET ? "/reset-password" : "/verify-email")
                .queryParam("token", event.token());
        if (changingEmail) {
            linkBuilder.queryParam("purpose", "email-change");
        }
        var link = linkBuilder.build().toUriString();
        var message = new SimpleMailMessage();
        message.setFrom(properties.from());
        message.setTo(event.email());
        message.setSubject(
                switch (event.purpose()) {
                    case REGISTRATION -> "Verify your FoC email address";
                    case EMAIL_CHANGE -> "Confirm your new FoC email address";
                    case PASSWORD_RESET -> "Reset your FoC password";
                });
        var body =
                switch (event.purpose()) {
                    case EMAIL_CHANGE -> """
                Open this link to update your FoC email address:
                %s

                Your current email address will remain unchanged until you verify this new address.
                This link expires in %d minutes. If you requested another email, use the latest link.
                If you did not request this change, you can ignore this email.
                """;
                    case REGISTRATION -> """
                Welcome to FoC!

                Open this link to verify your email address:
                %s

                This link expires in %d minutes. If you requested another email, use the latest link.
                If you did not create this account, you can ignore this email.
                """;
                    case PASSWORD_RESET -> """
                Open this link to reset your FoC password:
                %s

                This link expires in %d minutes. If you requested another email, use the latest link.
                If you did not request a password reset, you can ignore this email. Your password remains unchanged.
                """;
                };
        message.setText(body.formatted(link, properties.tokenTtl().toMinutes()));
        try {
            sender.send(message);
        } catch (MailException exception) {
            // The token is already committed. Resending issues another link.
            log.warn(
                    "Account email delivery failed for user {} ({})",
                    event.userId(),
                    exception.getClass().getSimpleName());
        }
    }
}
