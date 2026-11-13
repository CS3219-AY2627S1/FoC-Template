package com.friendoncampus.user.service;

import java.io.IOException;
import com.sendgrid.*;
import com.sendgrid.helpers.mail.Mail;
import com.sendgrid.helpers.mail.objects.Content;
import com.sendgrid.helpers.mail.objects.Email;

/** Twilio SendGrid adapter configured through environment-backed properties only. */
public class SendGridEmailVerificationMailer implements EmailVerificationMailer {
    private final SendGrid sendGrid; private final String fromEmail;
    public SendGridEmailVerificationMailer(String apiKey, String fromEmail) {
        if (apiKey == null || apiKey.isBlank() || fromEmail == null || fromEmail.isBlank()) throw new IllegalStateException("SENDGRID_API_KEY and SENDGRID_FROM_EMAIL are required when MAIL_PROVIDER=sendgrid");
        this.sendGrid = new SendGrid(apiKey); this.fromEmail = fromEmail;
    }
    @Override public void sendVerificationCode(String email, String code) {
        Mail mail = new Mail(new Email(fromEmail), "Verify your Friend on Campus email", new Email(email), new Content("text/plain", "Your Friend on Campus email verification code is " + code + ". It expires in 10 minutes."));
        Request request = new Request();
        try {
            request.setMethod(Method.POST); request.setEndpoint("mail/send"); request.setBody(mail.build());
            Response response = sendGrid.api(request);
            if (response.getStatusCode() >= 400) throw new IllegalStateException("Unable to send email verification");
        } catch (IOException exception) { throw new IllegalStateException("Unable to send email verification", exception); }
    }
}
