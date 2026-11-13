## Declaration of AI-assisted work

I drew the architecture myself — the endpoints, the functions that should exist, and how the service talks to the others — and had Claude fill them in one step at a time, reviewing each result.

- **Generate:** Claude was used to write the ledger, the idempotency and reservation logic and the tests, one step at a time from a plan.
- **Adapt:** Claude was used to keep the service in line with the other services' patterns for events, config and logging.
- **Debug:** Claude was used to chase down failing tests and edge cases around concurrent credit changes.
- **Explain:** Claude was used to explain each change before it was committed.
- **Document:** Claude was used to help write this document.
