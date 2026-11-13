-- Evidence is private authorization material, never a grant of case participant membership.
CREATE TABLE admin_reviewer_evidence (
    case_id UUID PRIMARY KEY REFERENCES admin_cases(id),
    order_id UUID NOT NULL,
    evidence_revision TEXT NOT NULL,
    order_sequence BIGINT NOT NULL,
    involved_ids TEXT NOT NULL,
    valid_until TIMESTAMP WITH TIME ZONE NOT NULL
);
