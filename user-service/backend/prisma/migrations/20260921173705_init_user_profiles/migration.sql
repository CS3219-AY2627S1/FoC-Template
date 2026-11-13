-- CreateTable
CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL,
    "cognito_sub" TEXT NOT NULL,
    "username" TEXT,
    "profile_picture_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_cognito_sub_key" ON "user_profiles"("cognito_sub");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_username_key" ON "user_profiles"("username");
