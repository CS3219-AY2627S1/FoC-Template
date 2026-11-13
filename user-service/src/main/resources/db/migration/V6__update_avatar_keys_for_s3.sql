ALTER TABLE users ALTER COLUMN avatar_key TYPE VARCHAR(255);
UPDATE users SET avatar_key = NULL;
