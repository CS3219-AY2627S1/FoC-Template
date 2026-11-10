# Verification email: Mailpit locally, SES on AWS

User Service retains its existing `OtpSender` boundary. SMTP/Mailpit is the
default. Selecting SES uses its HTTPS API with the AWS SDK's normal credential
chain. It does not use the sender mailbox's password, SMTP credentials, Supabase
Auth, a new service or a new database schema. Registration/verification/resend
endpoints and security rules remain unchanged.

## Configuration and development compatibility

| Setting | Development | SES deployment |
| --- | --- | --- |
| `OTP_EMAIL_PROVIDER` | `smtp` (default) | `ses`, explicitly selected |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_FROM` | Existing Mailpit settings | Not used by the SES sender |
| `SES_REGION` | Optional/blank | The region where sender and sending access are configured |
| `SES_FROM_ADDRESS` | Optional/blank | Exact verified sender mailbox |
| AWS credentials | Not needed | Temporary EC2 instance-role credentials |

Root and User-service development Compose explicitly select SMTP and point to
Mailpit. Normal local development does not create an AWS session or send real
email. Existing test-injected senders remain supported. The cloud Compose also
defaults to SMTP for backward compatibility; updating the image alone does not
switch an existing cloud environment to SES. Do not copy cloud configuration
over development settings or regenerate existing keys/passwords.

SES settings are validated before startup when selected. The client is created
lazily in a delivery thread, so network/credential discovery does not block the
async event loop or occur during default SMTP startup. Each delivery uses a
short-lived SDK client with connect/read timeouts and one SDK attempt: SendEmail
has no idempotency token, so the existing explicit resend flow handles uncertain
delivery. A timeout may mean the provider accepted the first email; a resend
replaces the valid OTP under the existing rules.

Provider rejection, quota/throttling, missing credentials and connectivity errors
become the existing `503 OTP_DELIVERY_FAILED` response. There is no fallback to
Mailpit or fake successful registration when SES fails. The already committed
pending challenge remains subject to the current resend/expiry rules; the user
is not activated and registration events are not emitted until verification.

Only safe failure metadata is logged. SDK debug logging is suppressed to avoid
logging request bodies/authorization headers. SES message acceptance is not a
guarantee of inbox delivery: test the actual intended recipient and inspect
provider feedback. A sender using a third-party mailbox domain cannot configure
that domain's DKIM; a verified domain controlled by the team is a stronger
deliverability setup if mailbox-only sending is rejected or classified as spam.

## AWS setup (operator steps; not performed by the application)

1. Check `sesv2 get-account` in Singapore. Sandbox/identity state is regional.
   Inspect `SendingEnabled`, `ProductionAccessEnabled` and `SendQuota` to confirm
   the current sending permissions and limits.
2. Create an SES email identity for a real personal/group mailbox the team may
   use and can open. Click the verification email's link in that mailbox. This
   establishes sender control, not ownership of its whole domain. Never provide
   the mailbox password to the application or AWS CLI command.
3. While in the sandbox, verify each intended **test recipient** too. The
   application still accepts registration only for `@u.nus.edu`; its normal OTP
   email and the one-time AWS verification email are different messages.
   Production access is needed before arbitrary NUS students can register
   without first being verified with AWS.
4. Add a scoped inline send policy to the EC2 instance role (`foc-ec2-role`),
   replacing the account, sender and verified test-recipient placeholders in
   [`ses-send-email.policy.example.json`](../../deploy/aws/iam/ses-send-email.policy.example.json)
   with the account ID and exact verified identities. If sending returns
   `AccessDeniedException` on a verified recipient identity, check that the
   policy covers that identity. Include each verified sandbox test recipient's ARN in
   `Resource` as well as the sender ARN. Retain the exact sender in the
   `ses:FromAddress` condition: listing the recipient ARN must not permit using
   that address as the From address. Add additional verified test recipients
   explicitly; do not solve this by granting unrestricted SES access. This
   scoped test policy must be reviewed when enabling public production signup.
   Attach only `ses:SendEmail`, not administrator or full SES permissions. Keep the
   existing SSM policy. The operator's SSO role and EC2 application role are
   distinct; being able to inspect SES on the PC does not grant EC2 send access.
5. Check that the User container can use IMDSv2 instance-role credentials. The
   existing EC2 metadata response hop limit must support the container network
   (commonly two); do not disable IMDSv2 or paste credentials into Compose.
   Instance-role permissions are host-level, not a per-container role boundary;
   keep them narrow. Use application delivery/error checks without printing
   credential endpoint responses.
6. Merge the tested User Service change and pull it on EC2. Use the cloud
   configuration helper below to enable SES, rebuild/recreate User API and
   verify actual NUS inbox delivery. Keep the private Mailpit container for
   controlled development/demo use; do not expose its inbox publicly.
7. For independent public signup, request SES production access for transactional
   OTP mail, with an accurate description of consent, rate limits and how the
   team handles bounce/complaint feedback. Approval is separate from sender
   verification and is not guaranteed. Confirm `ProductionAccessEnabled` before
   allowing signup from recipients that are not individually verified in SES.
   If the Get set up console disables its request button until a sending
   domain is verified, verifying a Gmail mailbox does not satisfy that domain
   requirement or provide DNS control. AWS also documents `sesv2 put-account-details` as a
   production-access request route without a domain parameter; this submits a
   review request, not an immediate approval or a bypass of AWS requirements.
   If the API/reviewer requires a domain, use a team-controlled domain or retain
   sandbox testing. Domain verification requires control of the domain's DNS;
   NUS and AWS-assigned CloudFront domains are not team-controlled domains.

No AWS resource is created, sender verified, policy attached, real email sent or
production request submitted by the service code or CI tests.

## Production approval and public NUS recipients

Check the deployment account in the configured SES region:

```sh
aws sesv2 get-account --profile foc --region ap-southeast-1 --query "{SendingEnabled:SendingEnabled,ProductionAccessEnabled:ProductionAccessEnabled,SendQuota:SendQuota}" --output json --no-cli-pager
```

Public signup requires sending enabled and `ProductionAccessEnabled=true`.
The returned quota defines sending limits, not free email credits or application
capacity. Recheck these settings when preparing a deployment.

Production recipients do not need individual AWS identity verification. They
still enter the FoC OTP to activate their account. The sender must remain verified.
For public NUS signup, use
[`ses-send-email.production.policy.example.json`](../../deploy/aws/iam/ses-send-email.production.policy.example.json)
after replacing the account and sender placeholders. Replace the existing named
inline send policy rather than leaving another broader policy attached. This
policy covers identity resources only in the specified account/Singapore region,
allows only SendEmail, requires the exact group From address, and requires every
recipient to be in @u.nus.edu. The recipient condition also covers CC/BCC.
The identity wildcard avoids individually listing recipient identity resources;
the From condition still prevents sending as a recipient identity.

IAM-only updates require no image rebuild or service restart. After updating
permissions, test actual public signup using a consenting new NUS user whose
address has not been verified in AWS. Approval and simulation are not inbox
delivery evidence. Enable feedback forwarding and assign an operator to review
the sender mailbox's bounce/complaint notifications, or configure automated
handling. Local Mailpit behavior is unchanged.

## Enable on EC2 once sender/recipient/IAM are ready

After a reviewed merge, from `/opt/foc` as `ssm-user`, replace the example with
the exact verified mailbox (no display name):

```bash
python3 deploy/aws/scripts/configure_email.py --provider ses --region ap-southeast-1 --sender sender@example.com
```

This atomically changes only the provider/region/sender fields in the existing
ignored cloud environment, retaining owner-only mode and all other credentials,
keys and data. It does not change AWS settings or send an email.

```bash
python3 deploy/aws/scripts/validate.py --public
```

```bash
sudo docker compose --env-file deploy/aws/.env -f deploy/aws/compose.yaml -f deploy/aws/compose.public.yaml --profile chat --profile admin --profile voice-assist build user-service
```

```bash
sudo docker compose --env-file deploy/aws/.env -f deploy/aws/compose.yaml -f deploy/aws/compose.public.yaml --profile chat --profile admin --profile voice-assist up -d --no-deps user-service
```

User API recreation briefly interrupts User-dependent requests. No database
reset, admin bootstrap, key rotation or restart of unrelated services is needed.
The outbox publisher does not send OTP email, so it needs no email-only restart.

For an intentional return to the private test inbox, select `--provider smtp`
with the helper and recreate the API. That is an operator mode change, not an
automatic fallback after a failed SES request.

## Acceptance checks

- With default development Compose, register and read the OTP in Mailpit; no AWS
  role, verified sender or external email is needed.
- With SES and a verified sandbox test recipient, register through the public
  HTTPS URL and receive the OTP in the actual NUS inbox (check spam as well).
- An invalid code does not activate the account; resend invalidates the old code;
  the new valid code activates once and writes the normal registration event.
- When SES rejects/throttles the request or credentials are unavailable, the API
  reports `OTP_DELIVERY_FAILED`; no silent test-inbox send or activated user.
- Check the normal Credit registration allocation still follows successful user
  verification. This change does not modify that asynchronous workflow.
- No OTP, recipient, provider exception body or credentials appear in ordinary
  failure logs/API errors. Existing configuration secrets are not rotated.

Automated SES tests use botocore Stubber with dummy credentials, never real AWS.
Real PostgreSQL integration tests exercise failed delivery/resend/activation;
live Mailpit checks use a disposable inbox. Inbox delivery, IMDS credentials and
SES production approval remain operator/live acceptance steps.

## References

- [SES identity verification](https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html)
- [SES sandbox/production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)
- [SES SendEmail API](https://docs.aws.amazon.com/boto3/latest/reference/services/sesv2/client/send_email.html)
- [AWS SDK credential chain](https://docs.aws.amazon.com/boto3/latest/guide/credentials.html)
