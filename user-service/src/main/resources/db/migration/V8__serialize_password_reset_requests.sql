CREATE TABLE password_reset_request_guard (
    id INTEGER PRIMARY KEY CHECK (id = 1)
);

INSERT INTO password_reset_request_guard (id) VALUES (1);
