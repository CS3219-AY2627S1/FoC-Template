CREATE TABLE admin_cases (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL UNIQUE,
    state VARCHAR(16) NOT NULL CHECK (state IN ('OPEN', 'UNDER_REVIEW', 'RESOLVED')),
    reviewer_id UUID,
    revision BIGINT NOT NULL DEFAULT 0,
    CHECK (state = 'OPEN' OR reviewer_id IS NOT NULL)
);
CREATE TABLE admin_case_participants (
    case_id UUID NOT NULL REFERENCES admin_cases(id),
    user_id UUID NOT NULL,
    PRIMARY KEY (case_id, user_id)
);
