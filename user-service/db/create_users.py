from common.db import get_db_connection

def create_users_table():
    with get_db_connection() as db:
        with db.cursor() as cs:
            cs.execute(
                """
                    CREATE TABLE IF NOT EXISTS users (
                        user_id UUID PRIMARY KEY DEFAULT uuidv7(),
                        username VARCHAR(50) UNIQUE NOT NULL,
                        user_email TEXT UNIQUE NOT NULL
                            CHECK (user_email LIKE '%@%.%'),
                        password_hash TEXT NOT NULL,
                        user_role TEXT NOT NULL DEFAULT 'user'
                            CHECK (user_role IN ('user', 'admin', 'admin_manager')),
                        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP 
                    );
                """
            )

if __name__ == "__main__":
    create_users_table()
