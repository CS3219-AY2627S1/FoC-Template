CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "cognito_sub" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL,
    "role" TEXT NOT NULL,
    "cognito_access_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_sessions_token_hash_key" ON "user_sessions"("token_hash");
CREATE INDEX "user_sessions_cognito_sub_idx" ON "user_sessions"("cognito_sub");
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions"("expires_at");
