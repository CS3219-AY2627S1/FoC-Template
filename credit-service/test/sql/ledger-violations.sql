-- AI Assistance Disclosure:
-- Tool: OpenAI Codex (model: GPT-6), date: 2026-10-22 (Asia/Singapore).
-- Scope: Shared SQL oracle for the human-defined scoped ledger invariants; empty rows means pass.
-- Author review: I reviewed the SQL operations and verified that they satisfy the design.
-- Prompts/key responses: ../../ai/usage-log.md, entry 039.

-- Parameters: $1 = scenario user IDs (text[]), $2 = scenario reservation IDs (uuid[]).
-- Run only after every operation in the round has finished.

WITH scope AS (
    SELECT $1::text[] AS user_ids, $2::uuid[] AS reservation_ids
), account_rows AS (
    SELECT a.* FROM credit_accounts a CROSS JOIN scope s WHERE a.user_id = ANY(s.user_ids)
), reservation_rows AS (
    SELECT r.* FROM reservations r CROSS JOIN scope s WHERE r.reservation_id = ANY(s.reservation_ids)
), history_rows AS (
    SELECT h.* FROM credit_history h CROSS JOIN scope s
    WHERE h.user_id = ANY(s.user_ids) OR h.reservation_id = ANY(s.reservation_ids)
), reservation_summary AS (
    SELECT r.*, h.* FROM reservation_rows r CROSS JOIN LATERAL (
        SELECT count(*) FILTER (WHERE type = 'RESERVED') AS reserved_count,
            count(*) FILTER (WHERE type = 'RESERVATION_UPDATED') AS updated_count,
            count(*) FILTER (WHERE type = 'RELEASED') AS released_count,
            count(*) FILTER (WHERE type = 'TRANSFER_OUT') AS out_count,
            count(*) FILTER (WHERE type = 'TRANSFER_IN') AS in_count,
            coalesce(sum(total_reserved_change) FILTER (WHERE type IN ('RESERVED', 'RESERVATION_UPDATED')), 0) AS held_changes,
            count(*) FILTER (WHERE type = 'RELEASED' AND
                (total_amount_change <> 0 OR total_reserved_change <> -r.credit_amount)) AS bad_release,
            count(*) FILTER (WHERE type = 'TRANSFER_OUT' AND
                (total_amount_change <> -r.credit_amount OR total_reserved_change <> -r.credit_amount)) AS bad_out,
            count(*) FILTER (WHERE type = 'TRANSFER_IN' AND
                (total_amount_change <> r.credit_amount OR total_reserved_change <> 0)) AS bad_in
        FROM credit_history WHERE reservation_id = r.reservation_id
    ) h
), account_summary AS (
    SELECT a.*, h.*, coalesce((SELECT sum(r.credit_amount) FROM reservation_rows r
        WHERE r.requester_id = a.user_id AND r.status = 'RESERVED'), 0) AS active_holds
    FROM account_rows a CROSS JOIN LATERAL (
        SELECT coalesce(sum(total_amount_change), 0) AS ledger_total,
            coalesce(sum(total_reserved_change), 0) AS ledger_reserved
        FROM history_rows WHERE user_id = a.user_id
    ) h
)
SELECT 'history_links_and_actor' AS violation, h.id::text AS entity, to_jsonb(h) AS details
FROM history_rows h LEFT JOIN reservation_rows r ON r.reservation_id = h.reservation_id
WHERE (h.type = 'INITIAL_GRANT' AND (h.order_id IS NOT NULL OR h.reservation_id IS NOT NULL))
    OR (h.type <> 'INITIAL_GRANT' AND (
        r.reservation_id IS NULL OR h.order_id IS DISTINCT FROM r.order_id
        OR h.user_id IS DISTINCT FROM CASE WHEN h.type = 'TRANSFER_IN' THEN r.courier_id ELSE r.requester_id END
    ))
UNION ALL
SELECT 'reservation_original_hold', r.reservation_id::text, to_jsonb(r)
FROM reservation_summary r WHERE reserved_count <> 1
UNION ALL
SELECT 'reservation_held_amount', r.reservation_id::text, to_jsonb(r)
FROM reservation_summary r WHERE held_changes <> credit_amount
UNION ALL
SELECT 'reservation_version', r.reservation_id::text, to_jsonb(r)
FROM reservation_summary r WHERE version::bigint <> 1 + updated_count + released_count + out_count
UNION ALL
SELECT 'reservation_status_history', r.reservation_id::text, to_jsonb(r)
FROM reservation_summary r WHERE
    (status = 'RESERVED' AND released_count + out_count + in_count <> 0)
    OR (status = 'RELEASED' AND (released_count <> 1 OR out_count <> 0 OR in_count <> 0 OR bad_release <> 0))
    OR (status = 'SETTLED' AND (out_count <> 1 OR in_count <> 1 OR released_count <> 0 OR bad_out <> 0 OR bad_in <> 0))
UNION ALL
SELECT 'reservation_terminal_sets', r.reservation_id::text, to_jsonb(r)
FROM reservation_summary r WHERE released_count > 1 OR out_count > 1 OR in_count > 1
    OR (released_count > 0 AND out_count + in_count > 0)
UNION ALL
SELECT 'account_active_holds', a.user_id, to_jsonb(a)
FROM account_summary a WHERE reserved_credits <> active_holds
UNION ALL
SELECT 'account_history_balances', a.user_id, to_jsonb(a)
FROM account_summary a WHERE total_credits <> ledger_total OR reserved_credits <> ledger_reserved
UNION ALL
SELECT 'scenario_missing_account', expected.user_id, jsonb_build_object('missing', expected.user_id)
FROM scope s CROSS JOIN LATERAL unnest(s.user_ids) AS expected(user_id)
LEFT JOIN account_rows a ON a.user_id = expected.user_id WHERE a.user_id IS NULL
UNION ALL
SELECT 'scenario_conservation', 'scenario', jsonb_build_object('actual', sum(total_credits), 'expected', 10::bigint * count(*))
FROM account_rows HAVING coalesce(sum(total_credits), 0) <> 10::bigint * count(*)
ORDER BY violation, entity;
