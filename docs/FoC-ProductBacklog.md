# FoC Product Backlog

## Project Plan
[Project Gantt](https://nusu-my.sharepoint.com/:x:/g/personal/e1121185_u_nus_edu/IQC4UKQPeIL3T4K024gKad1YATPZH9YSua82rKQ8mBAMrhw?e=rAco0q)

## Selected Nice-to-haves

### Bookmarking

- Allow users to bookmark delivery and pickup locations

- Users can create requests more easily for locations that they commonly use

### Schedule errands

- Allow users to set scheduled errands that will be posted in the future

- Allow for recurring requests (e.g. coffee from Cool Spot every Monday morning at 9 a.m.)

### Real-time chat/call

- Allow courier and requester for a specific errand to chat or voice or video call.

- Allow for couriers and requesters to clarify doubts, confirm order details at the store, or organize meet-up time and location.

- The system can make use of the chat functionality for System notifications

### Translation

- Supporting the diverse student population of NUS by allowing translation into the native language of the user.

- Users have the option to set a preferred language

### Cloud and CI/CD

- Configuring the cloud provider, AWS or GCP, to handle our microservices

- Set up GitHub Actions to handle CI/CD, including static code analysis, compilation of containers, running automated test cases, then automatic uploading to cloud provider

## Functional Requirements

### User Service

| ID | Requirement | Priority | Planned Week |
| --- | --- | --- | --- |
| F1 | Support user registra tion |  |  |
| F1.1 | The system shall allow new users to register with a username, email and password. |  |  |
| F1.1.1 | The system shall reject usernames that are already in use. | High | Recess |
| F1.1.2 | The system shall reject emails that are not in a valid format (e.g. must contain @ and domain) | High | Recess |
| F1.1.3 | The system shall reject emails that are already registered to another account. | High | Recess |
| F1.1.4 | The system shall reject passwords that do not contain at least 8 characters, one uppercase letter, one lowercase letter, one digit, and one special character. | High | Recess |
| F1.1.5 | The system shall send an OTP to the provided email and only complete registration after the OTP is verified. | High | 7 |
| F1.1.6 | The system shall allow the user to request a new OTP email 60 seconds after the previous email was sent out, up to 5 times. | High | 7 |
| F1.1. 7 | The system shall invalidate the OTP after one use OR after 10 minutes OR afte r a new OTP is generated, whichever comes first. | High | 7 |
| F1.1. 8 | The system shall reserve the username and email during this OTP period to prevent duplicate emails/usernames. | High | 7 |
| F1.2 | The system shall store user login information securely. |  |  |
| F1.2.1 | The system shall store passwords as salted hashes. | High | Recess |
| F2 | Support user log in / log out |  |  |
| F2.1 | The system shall allow existing users to login with their username/email and password. |  |  |
| F2.1.1 | The system shall accept login attempts where the username/email and password matches a registered account. | High | Recess |
| F2.1.2 | The system shall reject login attempts where the username/email and password does not match a registered account. | High | Recess |
| F2.1.3 | The system shall authenticate subsequent requests from a logged-in user without requiring them to re-enter credentials for the duration of the session. | High | Recess |
| F2.2 | The system shall allow logged in users to log out. |  |  |
| F2.2.1 | The system shall ensure that users who have logged out must log in again to access the app. | High | 7 |
| F2.3 | The system shall support authorization for inter-service communication. |  |  |
| F2.3.1 | The system shall allow other services to verify a user’s identity and role from their active session. | High | 7 |
| F3 | Support password reset (“forgot password”) |  |  |
| F3.1 | The system shall allow users to request a password reset using their registered email |  |  |
| F3.1.1 | If the email matches a registered email, t he system shall send an OTP to the email before permitting the password change. | High | 7 |
| F3.1.2 | If the email does not match a registered email, the system shall not send an OTP to the email. | High | 7 |
| F3.1.3 | The system shall reject the new password if it does not meet the complexity rules specified in F1.1. 4. | High | 7 |
| F3.1. 4 | The system shall invalidate the OTP after one use or after 10 minutes or a new OTP is generated, whichever comes first. | High | 7 |
| F4 | Support viewing and updating profile information |  |  |
| F 4.1 | The system shall allow users to view their profile information |  |  |
| F4.1.1 | The system shall allow users to view their username and their registered email. | Med | 10 |
| F 4. 2 | The system shall allow users to change their registered email. |  |  |
| F 4. 2. 1 | The system shall reject the new email if it is already in use by another user or the same as the old email or does not meet complexity rules in F1.1.2. | Med | 10 |
| F 4. 2.2 | The system shall ask the user to enter their password and reject the email change if the password does not match the current account password. | Med | 10 |
| F 4.2.3 | The system shall send an OTP to the new email and require the user to enter it before allowing the email change. | Med | 10 |
| F4.2.4 | The system shall allow the user to request a new OTP email 60 seconds after the previous email was sent out, up to 5 times. | Med | 10 |
| F4.2.5 | The system shall invalidate the OTP after one use or after 10 minutes or a new OTP is generated, whichever comes first. | Med | 10 |
| F4.2. 6 | The system shall use the existing email for all communications and authenticatio n until the OTP verification is completed. | Med | 10 |
| F4. 3 | The system shall allow users to change their password. |  |  |
| F4.3.1 | The system shall ask the user to enter their password and reject the password change if the password does not match the current account password. | Med | 10 |
| F4.3.2 | The system shall send an OTP to the registered email and require the user to enter it before allowing the password change. | Med | 10 |
| F4.3.3 | The system shall reject the new password if it does not meet the complexity rules specified in F1.1.4, or is identical to the old password. | Med | 10 |
| F4.3.4 | The system shall invalidate any active sessions on other devices after a successful password change | Low | 10 |
| F4.4 | The system shall allow users to change their username. |  |  |
| F4.4.1 | The system shall reject the new username if it is already in use by another user or it is the same as the old username. | Med | 10 |
| F5 | Support role ma nagement |  |  |
| F5.1 | The system shall s upport u ser/ a dministrator / s uper a dministrator role management |  |  |
| F5.1.1 | The system shall enforce administrative privilege separation by managing users, administrators, and super administrators independently. | High | 7 |
| F5.1.2 | On application startup, if the super administrator does not exist, the system shall bootstrap a super administrator using pre-configured system credentials. | High | 7 |
| F5.1.3 | The system shall prevent registration of an administrator account via public user registration endpoints. | High | 7 |
| F5.1.4 | The system shall prevent a standard user account from modifying the role of any user (including himself). | High | 7 |
| F5.1.5 | The system shall prevent a n administrator user account from modifying the role of any user (including himself). | High | 7 |
| F5.1.6 | The system shall allow a super administrator user account to modify the role of any other user (excluding himself) either to administrator or to standard user. | High | 7 |
| F5.2 | The system shall support requestor/courier role management. |  |  |
| F5.2.1 | All users can post and fulfill errands without restriction | High | 7 |
| F5.2.2 | The system shall persist the user's last active view (requestor / courier) across sessions. | High | 7 |
| F5.3 | The system shall support user management for administrators (super / normal). |  |  |
| F5.3.1 | The system shall allow administrators to view all users. | High | 7 |
| F5.3.2 | The system shall allow administrators to view transaction details of individual users. | High | 7 |
| F5.3.3 | The system shall allow administrators to suspend / unsuspend individual users. | High | 7 |

### Supplier Service

| ID | Requirement | Priority | Planned Week |
| --- | --- | --- | --- |
| F6 | Support data persistence for campus suppliers |  |  |
| F6.1 | The system shall persist essential details based on supplier type. |  |  |
| F6.1.1 | For “ Facility ” supplier types, t he system shall maintain records for Name, Location and Description | High | Recess |
| F6.1.2 | For “Store” supplier types with opening hours, the system shall maintain records for Name, Location, Description and Opening Hours | High | Recess |
| F7 | Support user viewing of suppliers in Requester mode |  |  |
| F7.1 | The system shall list all active suppliers with their details as specified in F6.1, lest the description |  |  |
| F7.1. 1 | The system shall display a real-time status indicator (Open or Closed) and closing time based on current system time and store operating hours | High | Recess |
| F7.1. 2 | The system shall allow users to search and filter active suppliers by name, location, or current open status | Low | 7 |
| F7.2 | The system shall display complete detail pages for a selected supplier |  |  |
| F7.2.1 | The system shall display all available details as specified in F6.1 | High | Recess |
| F7.2.2 | The system shall display a fallback message if optional supplier detail fields are unpopulated | Low | 7 |
| F 8 | Support administrat ive management (CRUD) of campus suppliers |  |  |
| F 8.1 | The system shall allow administrators to view and manage all campus suppliers |  |  |
| F 8.1.1 | The system shall display a list of all suppliers, including active, inactive, and soft-deleted entries, showing all their details as specified in F6.1, and current status | High | Recess |
| F 8.1.2 | The system shall support filtering of the supplier list using the available fields | Low | 7 |
| F 8.2 | The system shall allow administrators to create new suppliers |  |  |
| F 8.2.1 | The system shall validate and require non-empty entries for supplier name, location, type, and operating hours (for Store supplier type) prior to creation | High | Recess |
| F 8.2.2 | The system shall reject duplicate supplier creation requests if an active supplier with identical name and location exists. | High | Recess |
| F 8.3 | The system shall allow administrators to update existing suppliers. |  |  |
| F 8.3.1 | The system shall allow administrators to modify supplier name, location, category, or operating schedule without leaving mandatory fields as specified in F8.2.1 blank | High | Recess |
| F 8.3.2 | The system shall preserve historical completed request records even when supplier metadata is updated. | High | Recess |
| F 8.4 | The system shall allow administrators to soft- delete suppliers |  |  |
| F 8.4.1 | The system shall soft-delete a supplier by toggling its active status, immediately hiding it from new request creation forms | High | Recess |
| F 8.4.2 | Upon soft-deletion of a supplier, the system shall automatically cancel all associated uncollected requests (Open / Accepted but not yet picked up) | Med | 7 |
| F8.4.3 | The system shall dispatch cancellation notifications to affected requesters and couriers when an order is cancelled due to supplier soft-deletion | Med | 7 |

### Order Service

| ID | Requirement | Priority | Planned Week |
| --- | --- | --- | --- |
| F9 | Support the creation of requests |  |  |
| F9.1 | The system shall allow users to create requests for a specific supplier. |  |  |
| F9.1.1 | The system shall allow users to specify for each request: Supplier Request description Delivery location Number of credits offered (with validation in F19.2) Complete-by [default indefinite ] Additional details [optional] Constraints: Complete-by time must be later than current time | High | Recess |
| F9.1.2 | The system shall only approve the request after a successful credit reservation has been confirmed by the credit service. | High | 7 |
| F10 | Support the listing of requests for users in Courier mode |  |  |
|  | F10.1 |  |  |
| F10.1.1 | The system shall show the details specified in F9.1.1. | High | Recess |
| F10.1.2 | The system shall allow users to filter requests by location, credits, and expiry time. | Low | 10 |
| F11 | Support the acceptance of requests for users in Courier mode |  |  |
|  | F11.1 |  |  |
| F11.1.1 | The system shall ensure that users are able to accept a request that is listed. | High | 7 |
|  | F11.2 |  |  |
| F11.2.1 | The system shall not allow acceptance if the requester and accepting user are the same. | High | 7 |
| F11.2.2 | The system shall not allow acceptance if the request has expired or has been cancelled. | High | 7 |
| F11.2.3 | The system shall not allow acceptance if the request has already had a courier assigned to it. | High | 7 |
| F12 | Support the assignment of a courier to an errand. |  |  |
|  | F12.1 |  |  |
| F12.1.1 | The system shall assign the accepting user as the courier for the request. | High | 7 |
| F12.1.2 | The system shall inform the accepting user of the successful assignment. | High | 7 |
| F12.1.3 | The accepted request shall appear in the courier’s active requests | High | 7 |
| F12.1.4 | The system shall update the request status from “open” to “accepted”. | High | 7 |
| F12.1.5 | The system shall ensure that this status change is updated for all users for that request. | High | 7 |
|  | F12.2 |  |  |
| F12.2.1 | The system shall ensure that only one courier can be assigned to a request based on the acceptance timestamp on the server. | High | 7 |
| F13 | Support marking a request as picked up. |  |  |
|  | F13.1 |  |  |
| F13.1.1 | The system shall reject pickup confirmation from any user other than the assigned courier. | High | 8 |
| F13.1.2 | The system shall reject pickup confirmation if the request is not in “accepted” status. | High | 8 |
| F13.1.3 | The system shall update the request status from “accepted” to “picked up” upon confirmation. | High | 8 |
| F14 | Support marking a request as delivered. |  |  |
|  | F14.1 |  |  |
| F14.1.1 | The system shall reject delivery confirmation from any user other than the assigned courier. | High | 8 |
| F14.1.2 | The system shall reject delivery confirmation if the request is not in “picked up” status. | High | 8 |
| F14.1.3 | The system shall update the request status from “picked up” to “delivered” upon confirmation. | High | 8 |
| F15 | Support marking a request as completed. |  |  |
|  | F15.1 |  |  |
| F15.1.1 | The system shall reject completion confirmation from any user other than the requestor. | High | 8 |
| F15.1.2 | The system shall reject completion confirmation if the request is not in “delivered” status. | High | 8 |
| F15.1.3 | The system shall update the request status from “delivered” to “completed” upon confirmation. | High | 8 |
| F15.1.4 | The system shall automatically mark “completed” a request 24 hours after the state is set to “delivered”, in case the requester forgot to mark as completed. | Low | 10 |
| F16 | Support the expiry of requests. |  |  |
|  | F16.1 |  |  |
| F16.1.1 | The system shall update the request status from “open” to “expired” when the acceptance deadline is reached. | Med | 9 |
| F16.1. 2 | The system shall notify the requestor when their request has expired | Med | 9 |
| F17 | Support the cancellation of requests. |  |  |
|  | F17.1 |  |  |
| F17.1.1 | The system shall update the request status from “open” to “cancelled” when the user cancels it. | High | 9 |
|  | F17.2 |  |  |
| F17.2.1 | The system shall provide an option for requesters to cancel a request that is ongoing when the complete-by deadline has passed. | Med | 9 |
| F17. 2. 2 | The system shall update the request status to “cancelled” when the user cancels it. | Med | 9 |
| F18 | Support the editing of requests |  |  |
|  | F18.1 |  |  |
| F18.1.1 | The system shall ensure that requesters are only able to edit requests that are “open”. | High | 9 |
| F18.1.2 | The system shall allow users to edit “open” requests’ fields in accordance to F9.1.1 | High | 9 |

### Credit Service

| ID | Requirement | Priority | Planned Week |
| --- | --- | --- | --- |
| F19 | Closed Credit Economy |  |  |
|  | F19.1 |  |  |
| F19.1.1 | The system shall allocate 20 credits to each new user upon successful registration. | High | Recess |
|  | F19.2 |  |  |
| F19.2.1 | The system shall reserve the offered credits from the requester's unreserved balance when a request is created. | High | Recess |
| F19.2.2 | Reserved credits shall not be available for any other transaction until they are transferred or released. | High | Recess |
| F19.2. 3 | The system shall reject request creation when the credits offered exceed the requester's unreserved balance. | High | Recess |
|  | F19.3 |  |  |
| F19.3.1 | The system shall transfer the reserved credits from the requester to the assigned courier when a request reaches the "completed" state | High | 7 |
| F19.3.2 | The system shall ensure that at most one credit transfer is recorded per request. | High | 7 |
|  | F19.4 |  |  |
| F19.4.1 | The system shall return the reserved credits to the requester when a request is cancelled or expires. | High | 8 |
|  | F19.5 |  |  |
| F19.5.1 | The system shall allow a user to view their reserved balance, unreserved balance, and total balance. | High | 8 |
| F19.5.2 | The system shall allow a user to view transaction records in which they are the originating or destination user. | High | 8 |
| F20 | Transaction Logging |  |  |
|  | F20.1 |  |  |
| F20. 1.1 | The system shall record every credit operation with the following details: Transaction ID (unique) Transaction type (allocation, reservation, transfer, release) Originating user (not applicable for allocation) Destination user (applicable to transfer only) Amount Timestamp Associated request ID | High | 9 |
|  | F20.2 |  |  |
| F20.2.1 | The system shall restrict access to the transaction log to users with the administrator role. | High | 9 |

### User Service

| ID | Requirement | Priority | Planned Week |
| --- | --- | --- | --- |
| NFR1 | The system shall protect user accounts against brute-force attacks. |  |  |
| NFR1. 1 | The system shall automatically lock an account for 1 hour after 5 consecutive failed login or OTP attempts within a 1 5 -minute window. |  |  |
| NFR1. 1.1 | Upon account lock, the system shall dispatch a security notification email with an unlock link to the registered email address within 60 seconds. | Med | 10 |
| NFR2 | The system shall provide timely delivery of OTP emails. |  |  |
| NFR2.1 | The system shall dispatch the OTP email within 1 minute of the triggering event. |  |  |
| NFR2.1.1 | The system shall retry failed OTP email attempts up to 3 times. | Med | 10 |
| NFR2.1.2 | The system shall log any OTP email delivery failures for monitoring. | Med | 10 |
| NFR 3 | The system shall enforce additional authentication and data masking for sensitive user information and high-risk administrative actions. |  |  |
| NFR 3.1 | The system shall restrict the visibility of sensitive user information (full email addresses, contact numbers) on administrative interfaces. |  |  |
| NFR 3.1.1 | The system shall automatically mask sensitive user fields (e.g., email addresses) by default across all standard administrative views. | Med | 10 |
| NFR 3.1. 2 | The system shall require administrators to complete secondary OTP verification before unmasking sensitive user fields. | Med | 10 |
| NFR 3.1. 3 | Upon successful OTP verification, unmasked information shall remain visible for a maximum session window of 15 minutes before automatically re-masking. | Med | 10 |
| NFR3.2 | The system shall restrict high-risk administrative actions. |  |  |
| NFR3. 2. 1 | The system shall require secondary OTP verification prior to executing sensitive administrative actions (e.g., manual account suspension or direct credit balance adjustments). | Med | 10 |
| NFR3.2.2 | The system shall record all secondary OTP verification attempts and high-risk administrative actions in a n audit log. | Med | 10 |
| NFR4 | The system shall support user sessions. |  |  |
| NFR4.1 | The system shall enforce session expiry. |  |  |
| NFR4.1.1 | The system shall automatically invalidate a user’s session after 30 minutes of inactivity, requiring re-authentication to continue. | High | 8 |
| NFR4.1. | The system shall automatically inv alidate a user’s session after 7 days since the last log in, requiring re-authentication to continue. | High | 8 |
| NFR4.2 | The system shall provide session expiry warnings. |  |  |
| NFR4.2. 1 | The system shall notify the user 1 minute before their session expires due to inactivity and provide an option to extend it. | High | 8 |

## Non-Functional Requirements

### Order Service

| ID | Requirement | Priority | Planned Week |
| --- | --- | --- | --- |
| NFR5 | The listings page shall show responsively when the state of a request has been changed (e.g. from open to accepted, etc.). |  |  |
|  | NFR5.1 |  |  |
| NFR5.1.1 | The 2 -second update time shall be measured from when the request is sent from the client to when the server broadcasts the event | High | 9 |

### Supplier Service

| ID | Requirement | Priority | Planned Week |
| --- | --- | --- | --- |
| NFR6 | The system shall protect stored supplier records against unauthorised modification. |  |  |
|  | NFR6.1 |  |  |
| NFR6.1.1 | Every modification request shall undergo token verification. Non-administrative requests shall be rejected without modifying persistent state. | High | 7 |
| NFR7 | The system shall maintain low latency as supplier entries scale. |  |  |
|  | NFR7.1 |  |  |
| NFR7.1.1 | The system shall paginate or lazy-load the supplier list if it exceeds a defined size of 50 | Med | 8 |

### Credit Service

| ID | Requirement | Priority | Planned Week |
| --- | --- | --- | --- |
| NFR8 | The system shall guarantee strict transaction consistency and the integrity of credit balances. |  |  |
|  | NFR8.1 |  |  |
| NFR8.1.1 | The system shall ensure that concurrent requests affecting a user's credit balance are processed atomically to prevent race conditions. | High | 7 |
| NFR8.1. 2 | In the event of a system failure during a credit transfer, the system shall perform a complete rollback to guarantee both wallets remain in their original, consistent state. | High | 8 |
|  | NFR8.2 |  |  |
| NFR8.2.1 | The system shall not delay transactions by more than 500ms when logging each operation. | Med | 10 |
| NFR8.2.2 | The system shall retain each transaction record for at least 2 years from its timestamp. | Med | 10 |
| NFR8.2.3 | Transaction log records shall be append-only. The system shall not permit any user, including administrators, to modify or delete a logged transaction. | Med | 7 |

