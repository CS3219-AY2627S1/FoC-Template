CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(16) NOT NULL,
    PRIMARY KEY (user_id, role),
    CONSTRAINT user_roles_role_valid CHECK (role IN ('REQUESTER', 'COURIER', 'ADMIN'))
);

INSERT INTO user_roles (user_id, role) SELECT id, 'REQUESTER' FROM users;
INSERT INTO user_roles (user_id, role) SELECT id, 'ADMIN' FROM users WHERE role = 'ADMIN';

ALTER TABLE users DROP CONSTRAINT users_role_valid;
ALTER TABLE users DROP COLUMN role;
