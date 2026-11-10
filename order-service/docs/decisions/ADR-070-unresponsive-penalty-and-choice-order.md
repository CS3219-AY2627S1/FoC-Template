# ADR-070 - Active courier unresponsiveness and ordered choices

Accepted: explicit Yao Xiang instruction, 2026-11-10. See CHANGE-186.

COURIER_UNRESPONSIVE returns to the active report-policy set at 3 points;
COURIER_BAD_ATTITUDE leaves active sets but retains its 2-point compatibility
constant. Consumers continue processing saved historical outcomes. No database
rewrite or new topic is needed. Admin selectors sort numerically rather than
depending on enum/provider order. Existing deferred maximum-at-final-outcome rules
and explicit no-penalty admin cancellation are unchanged.
