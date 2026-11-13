# Timestamp: 2026-09-22
# Key Prompt:

F7
Support addition of suppliers by administrators.
7.1
The system shall create a supplier record when an administrator submits valid required supplier information.


7.1.1
Required supplier information shall include a supplier name, location, operational status, operating hours and at least one service type.


7.1.2
The system shall accept the following service types: printing, pick-ups, product purchasing, and food and beverage purchasing.


7.1.3
The system shall reject supplier creation when the request is not from an administrator.
F8
Support viewing of supplier information by authenticated users.
8.1
The system shall allow authenticated users to retrieve available supplier records on a map.


8.1.1
Each returned supplier record entry shall include the supplier’s name, location, operational status, operating hours and available service types.
8.2
The system shall support filtering and sorting of supplier records according to user-selected criteria.


8.2.1 
Applying sorting or filtering shall not modify supplier records.


8.2.2
The system shall allow users to filter suppliers by operational status.


8.2.3
The system shall allow users to filter suppliers by one or more service types.


8.2.4
When multiple filters are selected, the system shall display only suppliers that satisfy all selected filter conditions on the map.
F9
Support supplier information updates by administrators.
9.1
The system shall allow supplier information to be updated only when the requester is an administrator and the submitted information is valid.


9.1.1
The system shall reject the update and leave the existing supplier information unchanged when any required field is missing, incorrectly formatted, duplicated where uniqueness is required.


9.1.2
After applying an update to supplier information, the system shall notify the Errand Service.


9.1.3
The system shall reject the supplier update when the request is not from an administrator.
F10
Support removal of supplier records by administrators.
10.1
The system shall allow a supplier to be removed only when a user is an administrator and the supplier exists.


10.1.1
The system shall reject the removal and leave the supplier’s current status unchanged if the user is unauthorized, the supplier does not exist, or the supplier is not eligible for removal.


10.1.2
After applying an update to supplier information, the system shall notify the Errand Service.


10.1.3
The system shall reject the supplier removal when the request is not from an administrator.


Key Implementation details:

1. Integrate errand MFE with a shared host app.
Module Federation must expose your App component as errandFrontend through remoteEntry.js. React is shared as a singleton. The host passes in API clients, user profile, credit balance, navigation callbacks, and map viewport state. You must support both a full map view and smaller card overlays on the supplier map.

2. React state should coordinate the interface. It shall manage suppliers, selected supplier and errand, filters, map state, and admin panels using React hooks. Selecting a marker opens supplier details while selecting an errand replaces those details with an acceptance card.

3. Use Leaflet and OpenStreetMap. Suppliers whose markers overlap in screen space should be grouped into numbered clusters, recalculated when zoom changes. Clicking a cluster opens a supplier selection list. Marker coordinates also anchor the detail popovers.

5. Supplier discovery connects directly to errands  
A supplier’s detail card displays its location, operational status, opening hours, service types, and available errands. The errand panel requests (for example: `getSupplierErrandView({ scope: 'explore', supplierId })`) Users can accept an errand, with the button disabled while the request runs and errors shown inline. Successful acceptance invokes a host callback. However, this is not implemtented yet so you may leave it as a placeholder for now.

6. “My Requests,” “My Errands,” “New request,” and “Updates” delegate to the errand frontend through host navigation callbacks.

# Usage Scenario
Generated initial implementation, decomposed App.tsx into separate components.

