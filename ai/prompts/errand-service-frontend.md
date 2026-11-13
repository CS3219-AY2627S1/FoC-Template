# Timestamp: 2026-10-13
# Key Prompt:

Here are the functional requirements for my application. You are tasked with implementing the following requirements:

F11
Support creation of a new errand by a requestor.
11.1
The system shall create an errand when a requestor submits all required errand information.


11.1.1
Required errand information shall consist of a name of no more than 200 characters, a description of no more than 5,000 characters, a deadline, an active supplier, a service type offered by that supplier, a target location, and a non-negative credit amount expressed in credits.


11.1.2
The system shall accept a supplier only when the supplier is active, i.e. supplier is operational and current time is within operating hours.


11.1.3
The system shall accept a service type only when it is offered by the selected supplier.


11.1.4
The system shall reject the submission and identify each missing or invalid field when the submitted information does not satisfy F11.1.1, F11.1.2, or F11.1.3.


11.1.5
After initial validation, the system shall send a credit reservation request to the Credit Service.


11.1.6
If the credit reservation request is rejected by the Credit Service, then the errand shall not be created.


11.1.7
For each successfully created errand, the system shall record the submission date and time as the errand’s start time.


11.1.8
For each successfully created errand, the system shall assign the initial lifecycle state of open, meaning that the errand is now available for courier acceptance.
F12
Support viewing of errands made by a requestor.
12.1
The system shall provide all errands created by a requestor on a map.


12.1.1
By default, the system shall display errands that have the following lifecycle states: delivered, picked-up, accepted, open, expired, cancelled, confirmed. 
12.2
The system shall allow filtering of errands made by a requestor.


12.2.1
For start time and deadline ordering, the system shall support both ascending and descending order.


12.2.2
For target-location ordering, the system shall support ordering by distance from the requestor's current location, from nearest to furthest and from furthest to nearest.


12.2.3
For filtering, the system shall support filtering of errands by their lifecycle states.
12.3
The system shall provide the lifecycle state of each errand made by a requestor.


12.3.1
When an errand has an assigned courier, the system shall provide the courier’s name and profile picture with the errand.
F13
Support cancellation of errands made by a requestor.
13.1
The system shall allow an authenticated user to only cancel errands submitted by that same user when their lifecycle state is open.


13.1.1
When an errand is cancelled, the system shall change the lifecycle state from open to cancelled.


13.1.2
The system shall send a credit release request to the Credit Service.
F14
Support deletion of errands made by a requestor.
14.1
The system shall allow an authenticated user to only delete errands submitted by that same user when their lifecycle state is cancelled, expired or confirmed.


14.1.1
The system shall reject deletion when the errand is in the open, accepted, picked-up or delivered state, and shall leave the errand unchanged.
14.2
The system shall reject deletion in specified invalid scenarios.


14.2.1
The system shall reject deletion when the errand does not exist.


14.2.2
The system shall reject deletion when the errand does not belong to the authenticated user.


14.2.3
The system shall reject deletion when the errand is in the open, accepted, picked-up or delivered state before deletion is completed.
14.3
The system shall ensure that deletion does not reverse, alter, or duplicate any credit transfer associated with the errand.
14.4
Repeating a deletion request for an already deleted errand shall not create additional changes or additional credit transfers.
F15
Support viewing of errands made by other requestors.
15.1
The system shall provide a user with all open errands, where another user is recorded as the requestor.


15.1.1
For each provided errand, the system shall provide an errand summary containing the errand name and supplier location.


15.1.2
The system shall not show any errands that are not in the open lifecycle state.
15.2
The system shall provide the complete errand information for an available errand when a user requests its details.


15.2.1
Complete errand information shall consist of the information specified in F11.1.1.
F16
Support acceptance of open errands by eligible couriers.
16.1
The system shall accept an errand for a courier only when the errand is open, its deadline has not passed, and the courier is not the requestor of that errand.
16.2
The system shall allow a courier to accept an errand only when the courier does not have more than a specified number of assigned errands already.
16.3
When an errand is accepted, the system shall assign the accepting courier as the errand’s only courier and change the lifecycle state from open to accepted.
16.4
When an errand is accepted, the system shall exclude it from the open errand listing in F15.
16.5
When an errand is accepted, the system shall notify the requestor of that errand.
F17
Support dropping of errands by assigned couriers.
17.1
Upon dropping, the system shall change the lifecycle state from accepted to open.


17.1.1
The system shall allow an errand to be dropped only if the requesting courier is the courier assigned to the errand.


17.1.2
The system shall reject the dropping attempt and leave the errand unchanged if the errand lifecycle state is not accepted.


17.1.3
The system shall change the errand’s lifecycle state back to open only if the errand has not expired yet.


17.1.4
If the errand’s deadline has exceeded after cancellation by courier, its lifecycle state shall be set to expired.
17.2
Upon dropping the errand, the system shall unassign the courier from the errand.
F18
Support errand expiry.
18.1
The system shall change an errand’s lifecycle from open to expired when its recorded deadline is reached and the errand has not been accepted.


18.1.1
The system shall exclude an expired errand from open-errand listings and shall not allow it to be accepted.


18.1.2
The system shall not change the errand’s lifecycle if its recorded deadline is reached but the errand is in the accepted, picked-up, delivered, confirmed, or cancelled states.


18.1.3
The system shall send a credit release request to the Credit Service.
F19
Support errand pickup and delivery.
19.1
When the assigned courier confirms that the errand items have been collected, the system shall change the errand's lifecycle state from accepted to picked-up.


19.1.1
The system shall leave the errand lifecycle unchanged if the one updating the progress is not the assigned courier.
19.2
When the assigned courier confirms that the errand items have been delivered to the requestor, the system shall change the errand's lifecycle state from picked-up to delivered.


19.2.1
The system shall leave the errand lifecycle unchanged if the one updating the progress is not the assigned courier.
F20
Support confirmation of errand delivery.
20.1
The system shall allow the requestor to confirm the delivery of an errand.


20.1.1
When the requestor confirms that the delivered errand has been received, the system shall change the errand's lifecycle state from delivered to confirmed.


20.1.2
The system shall automatically change the lifecycle state from delivered to confirmed, if the requestor does not confirm the delivery within a reasonable amount of time


20.1.3
The system shall send a credit transfer requestF25 to the Credit Service after confirmation
F21
Support deletion of errands after errand completion
21.1
The system shall allow the requestor to delete a completed errand.


21.1.1
When the requester deletes a completed errand, the system shall change the errand’s lifecycle state from confirmed to deleted.
F22
Support receiving supplier information updates.
22.1
The system shall react to changes to supplier information.


22.1.1
The system shall determine whether a received supplier information notification affects any open or accepted errand.


22.1.2
The system shall update its relevant data when a supplier information change affects an errand.


22.1.3
The system shall maintain consistency of its own data after processing a supplier information notification.


22.1.4
The system shall record the outcome of processing a supplier information notification.

The contract between the errand service and host is as follows:

/** Credit Service methods for backend to implement */
export interface CreditApi {
  /// Synchronous HTTP methods

  /** Views credit balance for the authenticated user. */
  viewCredit(request: ViewCreditRequest): Promise<ViewCreditResponse>

  /** Views up to 100 history records for the authenticated user, skipping request.offset records. */
  viewCreditHistory(request: ViewCreditHistoryRequest): Promise<ViewCreditHistoryResponse>

  /** Reserves credit amount from available credits. */
  reserveCredit(request: ReserveCreditRequest): Promise<ReserveCreditResponse>

  /// Asynchronous commands from Kafka events

  /** Allocates initial credit amount for new user. */
  allocateInitialCredit(command: AllocateInitialCreditCommand): Promise<void>

  /** Releases credit amount from reserved credits. */
  releaseCredit(command: ReleaseCreditCommand): Promise<void>

  /** Transfers credit amount from sender's reserve balance to receiver's available balance. */
  transferCredit(command: TransferCreditCommand): Promise<void>

  /** Closes a user's credit account while preserving settlement history. */
  deleteUserCredit(command: DeleteUserCreditCommand): Promise<void>
}

The contract details are in packages/src/credit.

Use shared UI components wherever possible. DO NOT CREATE new components by yourself if there is a shared one already available.

Standardise the buttons used in the UI by checking the shared UI components.

Key Implementation Details

1. Integrate errand MFE with a shared host app.
Module Federation must expose your App component as errandFrontend through remoteEntry.js. React is shared as a singleton. The host supplies authentication identity, profile information, credit balance, API clients, navigation callbacks, and map viewport state. You must support both a full map view and smaller card overlays on the supplier map.

2. Use App.tsx to coordinate the main flows
Use React state and hooks rather than a separate state-management library. “My Requests” fetches errands with scope=mine, “My Errands” filters errands by the signed-in courier. Filters and sorting are computed locally and must cover the requirements stated above.

3. Use Leaflet and OpenStreetMap to implement the map.
Markers sit at pickup locations and change colour according to errand status. Overlapping markers must be grouped in the personal views, with a selection list for choosing an errand. Marker screen coordinates anchor detail popovers so it looks like the errand is jumping out from the parker. Resize observers and viewport callbacks must be implmemented to keep the map sized correctly and preserve its position across navigation. 

4. Notifications use Server-Sent Events.
For a future implementation, keep a skeleton in /api/notifications/stream, so I can connect to a persistent EventSource later.

# Usage Scenario:
Generated initial implementation, decomposed App.tsx into separate components.

