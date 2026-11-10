BEGIN;

-- Fail promptly if the application is busy; do not wait indefinitely for locks.
SET LOCAL lock_timeout = '5s';
LOCK TABLE "User", "PendingRegistration", "RegistrationOtpRequest" IN ACCESS EXCLUSIVE MODE;

-- Prepare the new values without changing accounts or discarding OTP history.
CREATE TEMP TABLE "_NormalizedRegistrationIdentity" ON COMMIT DROP AS
SELECT 'User' AS "source", "userId" AS "id", "email", "phoneNumber" FROM "User"
UNION ALL
SELECT 'PendingRegistration', "challengeId", "email", "phoneNumber" FROM "PendingRegistration"
UNION ALL
SELECT 'RegistrationOtpRequest', "id", "email", NULL::TEXT FROM "RegistrationOtpRequest";

-- The trim characters match JavaScript String.trim(). Emails accepted by our
-- Zod schema are ASCII, so C collation gives locale-independent lowercasing.
UPDATE "_NormalizedRegistrationIdentity"
SET "email" = lower(btrim("email", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') COLLATE "C"),
    "phoneNumber" = translate(btrim("phoneNumber", U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), ' -', '');

UPDATE "_NormalizedRegistrationIdentity"
SET "phoneNumber" = '+65' || "phoneNumber"
WHERE "phoneNumber" ~ '^[89][0-9]{7}$';

DO $migration$
BEGIN
    -- Matches the current Zod email format; this migration does not guess how
    -- to repair invalid identities or choose between conflicting accounts.
    IF EXISTS (
        SELECT 1 FROM "_NormalizedRegistrationIdentity"
        WHERE "email" !~ $email$^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$$email$
    ) THEN
        RAISE EXCEPTION 'Identity normalization stopped: invalid email values exist. Correct them before retrying.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "_NormalizedRegistrationIdentity"
        WHERE "phoneNumber" IS NOT NULL AND "phoneNumber" !~ '^\+65[89][0-9]{7}$'
    ) THEN
        RAISE EXCEPTION 'Identity normalization stopped: invalid Singapore mobile numbers exist. Correct them before retrying.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "_NormalizedRegistrationIdentity"
        WHERE "source" IN ('User', 'PendingRegistration')
        GROUP BY "source", "email" HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Identity normalization stopped: email addresses collide after normalization. Resolve them before retrying.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "_NormalizedRegistrationIdentity"
        WHERE "source" = 'User'
        GROUP BY "phoneNumber" HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Identity normalization stopped: user phone numbers collide after normalization. Resolve them before retrying.';
    END IF;
END;
$migration$;

UPDATE "User" AS account
SET "email" = normalized."email",
    "phoneNumber" = normalized."phoneNumber",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "_NormalizedRegistrationIdentity" AS normalized
WHERE normalized."source" = 'User' AND account."userId" = normalized."id"
    AND (account."email", account."phoneNumber") IS DISTINCT FROM (normalized."email", normalized."phoneNumber");

UPDATE "PendingRegistration" AS pending
SET "email" = normalized."email",
    "phoneNumber" = normalized."phoneNumber",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "_NormalizedRegistrationIdentity" AS normalized
WHERE normalized."source" = 'PendingRegistration' AND pending."challengeId" = normalized."id"
    AND (pending."email", pending."phoneNumber") IS DISTINCT FROM (normalized."email", normalized."phoneNumber");

UPDATE "RegistrationOtpRequest" AS request
SET "email" = normalized."email"
FROM "_NormalizedRegistrationIdentity" AS normalized
WHERE normalized."source" = 'RegistrationOtpRequest' AND request."id" = normalized."id"
    AND request."email" IS DISTINCT FROM normalized."email";

-- Existing unique indexes now operate on canonical values. CHECK constraints
-- reject noncanonical writes even from clients that bypass application Zod.
-- Email format validation stays in Zod; here we require lowercase, nonempty,
-- printable ASCII without whitespace. Phone numbers must use +65 format.
ALTER TABLE "User"
    ADD CONSTRAINT "User_email_canonical" CHECK ("email" = lower("email" COLLATE "C") AND "email" COLLATE "C" ~ '^[!-~]+$'),
    ADD CONSTRAINT "User_phoneNumber_canonical" CHECK ("phoneNumber" ~ '^\+65[89][0-9]{7}$');

ALTER TABLE "PendingRegistration"
    ADD CONSTRAINT "PendingRegistration_email_canonical" CHECK ("email" = lower("email" COLLATE "C") AND "email" COLLATE "C" ~ '^[!-~]+$'),
    ADD CONSTRAINT "PendingRegistration_phoneNumber_canonical" CHECK ("phoneNumber" ~ '^\+65[89][0-9]{7}$');

ALTER TABLE "RegistrationOtpRequest"
    ADD CONSTRAINT "RegistrationOtpRequest_email_canonical" CHECK ("email" = lower("email" COLLATE "C") AND "email" COLLATE "C" ~ '^[!-~]+$');

COMMIT;
