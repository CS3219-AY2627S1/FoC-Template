package com.friendoncampus.user.service;

import java.io.IOException;

import com.sendgrid.Method;
import com.sendgrid.Request;
import com.sendgrid.Response;
import com.sendgrid.SendGrid;
import com.sendgrid.helpers.mail.Mail;
import com.sendgrid.helpers.mail.objects.Content;
import com.sendgrid.helpers.mail.objects.Email;

/** Twilio SendGrid adapter. Credentials are supplied by environment-backed configuration only. */
public class SendGridPasswordResetMailer implements PasswordResetMailer {
    private final SendGrid sendGrid;
    private final String fromEmail;

    public SendGridPasswordResetMailer(String apiKey, String fromEmail) {
        if (apiKey == null || apiKey.isBlank() || fromEmail == null || fromEmail.isBlank()) {
            throw new IllegalStateException("SENDGRID_API_KEY and SENDGRID_FROM_EMAIL are required when MAIL_PROVIDER=sendgrid");
        }
        this.sendGrid = new SendGrid(apiKey);
        this.fromEmail = fromEmail;
    }

    @Override
    public void sendPasswordResetCode(String email, String code) {
        Mail mail = new Mail(new Email(fromEmail), "Friend on Campus password reset", new Email(email),
                new Content("text/plain", "Your Friend on Campus password reset code is " + code
                        + ". It expires in 10 minutes."));
        Request request = new Request();
        try {
            request.setMethod(Method.POST);
            request.setEndpoint("mail/send");
            request.setBody(mail.build());
            Response response = sendGrid.api(request);
            if (response.getStatusCode() >= 400) {
                throw new IllegalStateException("Unable to send password reset email");
            }
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to send password reset email", exception);
        }
    }
}
