package com.friendoncampus.user.service;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import org.junit.jupiter.api.Test;
class SendGridEmailVerificationMailerTest {
 @Test void requiresEnvironmentBackedCredentialsBeforeItCanBeEnabled() {
  assertThatThrownBy(() -> new SendGridEmailVerificationMailer("", "noreply@example.com")).isInstanceOf(IllegalStateException.class).hasMessageContaining("SENDGRID_API_KEY");
  assertThatThrownBy(() -> new SendGridEmailVerificationMailer("api-key", "")).isInstanceOf(IllegalStateException.class).hasMessageContaining("SENDGRID_FROM_EMAIL");
 }
}
