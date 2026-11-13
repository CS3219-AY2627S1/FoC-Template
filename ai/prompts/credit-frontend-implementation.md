# Timestamp: 2026-10-17
# Key Prompt:

F23
Support initial credit allocation for new users.
23.1
The system shall allocate a configured initial credit amount to new users.


23.1.1
The system shall initialize the user’s available balance with 100 credits.


23.1.2
The system shall initialize the reserved balance to 0 credits.
23.2
The system shall ensure initial credit allocation occurs only once per user account.


23.2.1
The system shall reject or ignore a repeated initial allocation request for an account that has already received its initial allocation.


23.2.2
The system shall preserve the user’s existing balance when a repeated initial allocation request is rejected or ignored.
F24
Support reservation of credits from the available balance.
24.1
The system shall validate a credit reservation request before creating the reservation.


24.1.1
The system shall check whether the requested amount exceeds the user’s available balance.


24.1.2
The system shall check whether the requested amount is a positive credit amount.


24.1.3
The system shall reject the credit reservation request if above checks do not pass.
24.2
The system shall reserve the credits.


24.2.1
The system shall deduct the reserved amount from the user’s available balance.


24.2.2
The system shall increase the user’s reserved balance by the same amount.
24.3
The system shall associate each credit reservation to a unique transaction identifier.


24.3.1
The system shall store the transaction identifier together with the reserved amount and originating user.


24.3.2
The system shall prevent more than one active reservation for the same transaction identifier.
24.4
The system shall prevent reserved credits from being used as available credits.


24.4.1
The system shall exclude reserved credits when evaluating subsequent reservation requests.
F26
Support release of credits from the reserved balance.
25.1
The system shall validate the release of reserved credits before releasing credits to the available balance.


25.1.1
The system shall check whether the released amount exceeds the user’s reserved balance.


25.1.2
The system shall check whether the released amount is a positive credit amount.


25.1.3
The system shall reject the credit release request if above checks do not pass.
25.2
The system shall release reserved credits.


25.2.1
The system shall deduct the reserved amount from the user’s reserved balance.


25.2.2
The system shall increase the user’s available balance by the same amount.
25.3
The system shall associate each credit release to a unique transaction identifier.


25.3.1
The system shall store the transaction identifier together with the release amount and originating user.


25.3.2
The system shall prevent more than one active credit release for the same transaction identifier.
F26
Support transfer of credits from a user’s reserved balance to another user’s available balance.
26.1
The system shall validate a credit transfer request before processing it.


26.1.1
The system shall verify that the reserved amount is sufficient for the request transfer.


26.1.2
The system shall verify that the designated recipient exists.


26.1.3
The system shall reject the credit transfer request if above checks do not pass.
26.2
The system shall transfer the credits after validation.


26.2.1
The system shall decrease the originating user’s reserved balance by the transferred amount.


26.2.2
The system shall increase the recipient’s available balance by the transferred amount.
F27
Support viewing of a user’s credit balance.
27.1
The system shall provide the user’s available credit balance.


27.1.1
The system shall return an available balance that reflects all completed reservations, releases and transfers.
27.2
The system shall provide the user’s reserved credit balance.


27.1.2
The system shall return a reserved balance that includes credits associated with active reservations.
F28
Support viewing of a user’s credit transaction history.
28.1
The system shall record each credit reservation.


28.1.1
Each reservation record shall contain its transaction identifier, user account, amount, timestamp, and transaction type.
28.2
The system shall record each credit release.


28.2.1
Each release record shall identify the reservation transaction being released.
28.3
The system shall record each credit transfer.


28.3.1
Each transfer record shall contain the originating account, recipient account, amount, transaction identifier and timestamp.
28.4
The system shall preserve a unique identifier for each recorded credit transaction.


28.4.1
The system shall allow a transaction record to be uniquely identified using its transaction identifier.

Ensure that the implementation meets the requirements above where relevant.

Implement a React and TypeScript microfrontend for the Credit service that integrates into the host application via Vite Module Federation. 

The remote provides views for available and reserved credit balances as well as transaction history.

React and React-DOM must be configured as shared singleton dependencies between the host and remote.
- Expose the entry point component as creditFrontend/App at /remotes/credit/remoteEntry.js.
- See the contract in packages/contracts/src/credit.
- Do not introduce an internal router.

DATA FETCHING & AUTH
- All HTTP requests must use a shared authFetch utility wrapper around fetch.
- Automatically include authentication cookies with every request (credentials: 'include').
- If a 401 response is received, attempt a single session refresh call and retry the original request once.

For avoidiance of doubt, the balance data flow is as follows:
1. The host fetches /api/credit.
2. After credit-changing operations, the host retains the current balance view while polling /api/credit in the background for an updated snapshot (availableCredit, reservedCredit, and lastUpdated).
3. Balance Polling: Retry up to 20 attempts with a 1-second delay between requests. Log an operational error if polling exhausts retries without updating.


CREDIT HISTORY
The credit remote fetches `/api/credit/history` when the history panel opens.
Automatically reload history when `authUser` or `authVersion` changes.
Provide an explicit user retry trigger on fetch failures.

- Moving between pre-loaded pages (e.g., page 1 to 2 within the first 100 records) must execute instantly without issuing network requests.
- When reaching the end of the loaded batch (e.g., clicking "Next" on page 10), fetch the next 100-record batch passing `offset = records.length`.
- Display page number in the format `Page X of Y+` (e.g., `Page 1 of 10+`) to indicate more records may exist beyond the current batch.


TRANSACTION PRESENTATION
Isolation: Perform all presentation formatting in a pure helper module that leaves the underlying data objects unmodified.
Formatting Rules:
- Credit Receiver: Format as green text with explicit plus sign (e.g., `+12 cr`).
- Credit Sender: Format as red text with explicit minus sign (e.g., `-12 cr`).
- Reservations: Neutral color text with explicit minus sign (e.g., `-12 cr`).
- Releases: Neutral color text with explicit plus sign (e.g., `+12 cr`).
- Date Formatting: Format timestamps dynamically using the browser's local datetime settings

LAYOUT 
- Enable horizontal scrolling for the history table on narrow viewports.

TESTING REQUIREMENTS
Write unit and integration tests for:
- Formatting, ensuring correct string signs (`+`/`-`), CSS color markers, and object immutability across transfers, reservations, and releases.
- Client-side pagination logic (ensure 0 network calls for pages 1-10)
- Preserve of preloaded records during additional-page fetch errors.

# Usage Scenario
Generated initial implementation, debugged implementation
