# ADR-071 - Internal report holds require service and user identity

Accepted by explicit Yao Xiang request, 2026-11-11; CHANGE-189 owns implementation.

Use a dedicated internal PUT route with Reporting's verified Google service ID token
and the original Firebase participant token. Retain user role/ownership checks rather
than trusting caller-supplied user IDs. Remove the former public placement path.
Gateway filtering complements, but does not replace, backend token verification.
ADC runtime identity requires no committed service-account key. Local emulators use
an explicit development-only credential with fail-closed environment gates.

No report lookup callback, schema migration, topic, funding or saga change. Trusting
Reporting means its durable creation coordinator remains responsible for submission
allocation; this does not solve the separately reviewed concurrent-upload race.
