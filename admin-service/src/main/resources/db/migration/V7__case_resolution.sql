CREATE TABLE admin_case_decisions (
    case_id UUID PRIMARY KEY REFERENCES admin_cases(id),
    reviewer_id UUID NOT NULL,
    resolution TEXT NOT NULL CHECK (length(trim(resolution)) BETWEEN 1 AND 2000),
    rejected_action_explanations TEXT NOT NULL,
    evidence_revision TEXT NOT NULL,
    evidence_coverage TEXT NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE NOT NULL,
    case_revision BIGINT NOT NULL
);
CREATE FUNCTION prevent_case_decision_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Case decisions are immutable';
END;
$$;
CREATE TRIGGER immutable_case_decision BEFORE UPDATE OR DELETE ON admin_case_decisions
    FOR EACH ROW EXECUTE FUNCTION prevent_case_decision_change();
