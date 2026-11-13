/*
Email server for OTP send
Using Nodemailer. EMAIL_TRANSPORT picks how mail leaves the service:
- 'smtp' (default): local Mailpit, or any SMTP server set via SMTP_*.
- 'ses': the Amazon SES API. No password; the AWS SDK finds credentials
  itself (the pod's IAM role via IRSA on EKS, AWS_PROFILE locally).
*/

import nodemailer from 'nodemailer';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { env } from '../../env';

function createTransport() {
  if (env.EMAIL_TRANSPORT === 'ses') {
    const sesClient = new SESv2Client({ region: env.AWS_REGION });
    return nodemailer.createTransport({ SES: { sesClient, SendEmailCommand } });
  }

  const auth = env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined;
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE, // true = TLS from the start (port 465)
    // With a login, require STARTTLS so the password is never sent in plain text.
    requireTLS: !!auth,
    ...(auth ? { auth } : {}),
  });
}

const transporter = createTransport();

interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export const sendEmail = async ({ to, subject, text, html }: EmailOptions): Promise<void> => {
  try {
    const info = await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject,
      ...(text ? { text } : {}),
      ...(html ? { html } : {}),
    });

    console.log(`Email sent successfully: ${info.messageId}`);
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};
