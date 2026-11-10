# Supplier UI requirement traceability

This maps the Supplier screens to the final product backlog and Milestone D2
point 5. The visual layout follows the shared [FoC Figma design](https://www.figma.com/design/1QaorStohl4p1T8PoC9YG5/CS3219---Project-6?node-id=0-1).
Only Supplier pages were added; sign-in and the existing profile remain User
Service pages.

| Backlog IDs | Supplier UI coverage | Boundary or remaining check |
| --- | --- | --- |
| `M2F1.1.1`–`M2F1.1.5` | Admin create form has required and optional fields, category choices from the API, paired coordinates/times, exact 24-hour `HH:mm`, and HTTP(S) URL validation. | Supplier Service validates again, generates ID and timestamps, and defaults status. |
| `M2F1.1.6`–`M2F1.1.7` | The form shows API duplicate and field errors without claiming success. | Normalized uniqueness and atomic rollback belong to the database/API. |
| `M2F1.2.1`–`M2F1.2.7` | Admin edit preloads the complete record; fields and categories can change, optional values can be cleared, status can change, and validation or load failures are displayed. ID and timestamps are read-only. | The API validates the merged row, rejects duplicates, and commits changes atomically. |
| `M2F1.3.1`–`M2F1.3.3` | Deactivate confirmation calls `DELETE`, which only deactivates, and refreshes the record. Inactive suppliers can be reactivated. | Permanent deletion (`M2F1.3.1`) is out of scope: suppliers are always retained. Order Service rejects an inactive supplier when an errand is created. |
| `M2F2.1.1`–`M2F2.1.4` | Normal list uses the active-only route; admin list uses the management route and includes status filtering. Both show required list fields and pagination/page-size controls when needed. | API enforces visibility and paging. The UI deliberately requests six rows per page for the layout; the API default remains 20 when omitted. |
| `M2F2.2.1`–`M2F2.2.3` | Detail view shows complete supplier data and handles not found, load failure, and retry states. | API supplies the record and sanitized error response. |
| `M2F3.1.1`–`M2F3.1.4` | Search automatically applies `q` for name, area, or pickup text after a short typing pause and trims whitespace. | API implements case-insensitive partial matching. |
| `M2F3.2.1`–`M2F3.2.4` | Category checkboxes send repeated `category` parameters; admin-only status combines with search. The separate exact-area filter was removed from the UI and API. | Backlog `M2F3.2.2` and the area portion of `M2F3.2.4` need revision for this simplified product scope. `q` still searches area text. |
| `M2F3.3.1`, `M2F3.4` | Name A–Z/Z–A controls and a clear empty-result state. | API provides stable ID tie-break sorting and the empty response. |
| `M2F4.1.1`–`M2F4.3.3` | Supplier pages require sign-in; management links and pages require Admin or Super Admin in the UI; every request sends the User Service access token. | Supplier Service verifies identity and fresh management permission for each request. UI role gating is for navigation, not the security boundary. |

## Nonfunctional requirements

| Backlog IDs | UI handling | Verification still needed |
| --- | --- | --- |
| `M2NFR1.1`–`M2NFR1.3`, `M2NFR2.1`–`M2NFR2.2` | List requests are paginated and show loading/error states. | Sprint 4 performance and scale targets need representative data and load tests; browser tests do not establish the percentile or concurrency targets. |
| `M2NFR3.1`–`M2NFR3.3` | Save success is shown only after an API response; validation/duplicate errors remain visible for correction. | Database uniqueness, durable commits, and rollback need service/database verification. |
| `M2NFR3.4` | Deactivating refreshes the admin view; normal browsing uses the active-only API. | Cross-client propagation within five seconds still needs a live integration test. |
| `M2NFR4.1`–`M2NFR4.2` | Unauthorized users cannot navigate to management screens from the client. | Current-permission checks before mutation remain the API's responsibility. |

## Responsive supplier listing

| Width | Navigation | User listing | Admin listing |
| --- | --- | --- | --- |
| Below 650px | Bottom tab bar; labels shrink below 360px so they do not split mid-word | One card per row | One stacked card per row |
| 650–1023px | Bottom tab bar | Two cards per row | Two cards per row |
| 1024–1299px | Sidebar | Three cards per row | Two cards per row |
| 1300px and wider | Sidebar | Three cards per row | Five-column table |

Filters wrap below the search field, and long names and areas wrap inside
their card. Action links are at least 24px tall, and on touch screens
(`pointer: coarse`) actions, selects and category options are 44px tall.
Browser tests check that the page never scrolls sideways at 320, 375, 768,
1024 and 1440 pixels, for both the user and admin listings.

## Supplier Service failure handling

`src/api/supplier-service.ts` turns every failed request into an
`ApiRequestError` with a message the page can show as is:

| Failure | Message shown |
| --- | --- |
| API error body (`{"error": {"code", "message", "fields"}}`) | The API's sanitized message; field errors go to the form fields |
| 5xx without a JSON body (gateway or proxy page) | "Supplier Service is unavailable right now. Try again in a moment." |
| No response (offline, DNS, refused) | "Check your connection and try again." |
| No response within 10 seconds | "Supplier Service took too long to respond. Try again." |
| 2xx that is not JSON, or JSON that cannot be parsed | "Supplier Service sent an unreadable response. Try again." |
| 401 | The shared auth provider refreshes the session once and retries; if that fails, the user is signed out |

When the list fails, the page shows an alert (`role="alert"`) with the
message and a **Try again** button, hides the pagination for the failed
query, and keeps the search and filters usable. When categories fail, the
supplier list still renders and the category menu offers its own retry,
which does not reload the list. A page size in the URL other than 6, 12, 20
or 50 falls back to 6, so a hand-edited link cannot fail validation on every
retry. Other unsupported filters in the link, such as an unknown category,
return `422`; the list then explains that the filters cannot be used and
offers **Clear filters** instead of **Try again**. On the detail page, a
malformed supplier ID (`422`) shows "Supplier not found" like a `404`, with no
retry. Responses that arrive after the query has changed are ignored.

## Milestone D2 point 5

The client provides live Supplier API screens for viewing, creating, editing,
deactivating, searching, filtering, sorting, and paginating. Layouts
were checked in browser tests at 320, 375, 768, 1024, and 1440 pixel widths
against the supplied desktop and mobile Figma direction. Browser tests mock
the API; the root Compose stack is the path for a live local demonstration.
