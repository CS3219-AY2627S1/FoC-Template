CREATE TABLE admin_bootstrap_state (
    id VARCHAR(32) PRIMARY KEY,
    completed_at TIMESTAMP WITH TIME ZONE,
    admin_id UUID REFERENCES users(id)
);

INSERT INTO admin_bootstrap_state (id) VALUES ('FIRST_ADMIN');
