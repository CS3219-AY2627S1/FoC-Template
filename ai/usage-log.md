# AI Usage Log

## LOH WAI KIT

### Date/Time

2026-09-23 to 2026-09-28

#### Tool

Codex

#### Prompt/Command

Implement frontend authentication integration, including login, session restoration, protected routes, authenticated requests, and logout. Apply subsequent changes requested during review.

#### Output Summary

Implemented login integration, in-memory access-token storage, shared refresh requests, protected routing, and logout handling. Updated Axios interception to refresh after a 401 response and retry the request once. Subsequently separated token storage and authentication coordination, removed the previous session module, and updated related tests and documentation.

#### Action Taken

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

#### Author Notes

I reviewed the implementation and requested simplification based on teammate feedback. The retained implementation restores sessions through refresh cookies and retries business requests once after a 401 response. A subsequent logout revision was reverted after review. Automated tests and manual integration checks were completed during implementation.

---

### Date/Time

2026-09-30 23:32 to 2026-10-01 00:18

#### Tool

Codex

#### Prompt/Command

Restrict registration to NUS email addresses ending in @u.nus.edu or @nus.edu.sg. Add frontend validation and backend enforcement without adding further restrictions to login or session refresh.

#### Output Summary

Added registration email-domain validation, backend enforcement, error handling, and focused tests. Applied the domain policy to the existing backend email-update operation. Adjusted the registration validation message following UI review.

#### Action Taken

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

#### Author Notes

I reviewed the implementation and requested adjustments to the placement of the validation message. Registration accepts the two agreed NUS email domains, with matching backend enforcement. Backend checks and manual integration testing passed.

---

### Date/Time

2026-10-08 to 2026-10-17

#### Tool

Codex

#### Prompt/Command

Implement registration email verification using Spring Mail and Gmail SMTP. Add verification links, automatic confirmation, and a resend option. Require verification before login and address subsequent review feedback.

#### Output Summary

Implemented email-token persistence, mail delivery, verification and resend endpoints, registration and login changes, and the frontend verification page. Prevented direct email changes through the ordinary profile-update endpoint. Added local Gmail SMTP instructions in SETUP.md, automated tests, and subsequent review fixes.

#### Action Taken

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

#### Author Notes

I reviewed the implementation and requested UI, documentation, and test adjustments. Users verify their registered email through an emailed link and can request another verification email when needed. Automated checks and CI passed. I also completed manual integration testing using Gmail SMTP.

---

### Date/Time

2026-10-10 to 2026-10-17

#### Tool

Codex

#### Prompt/Command

Implement verified email changes from the profile page. Send a verification link to the proposed address, update the email after confirmation, and preserve the current login session. Apply subsequent review fixes.

#### Output Summary

Implemented email-change request and confirmation endpoints, profile-page controls, and confirmation-page handling using the existing email-token functionality. Added notification to the previous email address and required verification for administrative email updates. Grouped email-change endpoints under /users and updated tests and documentation.

#### Action Taken

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

#### Author Notes

I reviewed the implementation and requested simpler form handling, fewer redundant tests, and fixes responding to teammate feedback. The existing email remains active until the new address is verified, and confirmation preserves the current login session. Automated checks and CI passed. Manual integration testing confirmed the email-change functionality.

---

### Date/Time

2026-10-11 to 2026-10-18

#### Tool

Codex

#### Prompt/Command

Implement Forgot Password from the login page using emailed password-reset links. Reuse existing email-token and password-update functionality, and address independent and teammate review findings.

#### Output Summary

Added password-reset request and submission endpoints, frontend request and reset pages, and password-reset emails. Reused password validation and password-saving logic. Revoked refresh tokens and pending password-reset and email-change links after password changes. Added uniform cooldown responses, explicit error handling, reset-completion notifications, and focused tests. Allowed password recovery for unverified accounts and marked the email verified after a successful reset.

#### Action Taken

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

#### Author Notes

I reviewed the implementation and requested fixes based on independent and teammate feedback. Users reset their password through an emailed link and then log in with the new password. A successful reset revokes existing refresh tokens and pending recovery or email-change links. Automated checks and CI passed. I manually verified the normal reset flow and completion notification; the remaining suggested manual scenarios were not tested.

---

### Date/Time

2026-11-02 22:48 to 2026-11-03 11:39

#### Tool

Codex

#### Prompt/Command

Implement AI-assisted errand creation according to the agreed requirements and local implementation plan. Add multi-turn chat, supplier selection, audio transcription, structured draft validation, and draft application to the existing creation form.

#### Output Summary

Implemented the frontend chat interface and backend AI endpoints. Added an OpenAI gateway, supplier validation, structured draft handling, frontend schema validation, recording controls, and automated tests.

#### Action Taken

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

#### Author Notes

I reviewed the implementation and requested subsequent adjustments. Users can inspect and apply the generated draft before proceeding through the existing review, order creation, and credit checks. Automated tests, frontend type checking, linting, and build checks were run during implementation.

---

### Date/Time

2026-11-03 to 2026-11-05

#### Tool

Codex

#### Prompt/Command

Fix integration issues in AI-assisted errand creation, including outdated form context, feature availability, deployment configuration, diagnostic logging, and a race condition between stopping a recording and starting transcription.

#### Output Summary

Added form-change handling and capability checks. Corrected Compose configuration, added upstream error diagnostics, expanded Terraform test coverage, centralized model defaults, and fixed recording state handling and the capability request timeout.

#### Action Taken

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

#### Author Notes

I reviewed the reported issues and requested the corresponding fixes. Form changes now prompt users to continue with the current AI draft or restart from the updated form. The recording fix keeps input and sending disabled until the audio is handed over to transcription. Regression tests covered delayed recording events, and the capability request was given a 15-second timeout.

---

### Date/Time

2026-11-06 01:04–01:16

#### Tool

Codex

#### Prompt/Command

Resolve conflicts when merging the updated main branch into AI-Assisted-Creation. Integrate the AI feature with the updated form, credit validation, and ECS configuration, then verify and commit the merge locally.

#### Output Summary

Resolved five merge conflicts, integrated AI draft application with the updated form and credit checks, and adapted the AI deployment configuration to the updated ECS structure. Added a regression test for an AI-generated reward exceeding the user's available balance.

#### Action Taken

- [x] Accepted as-is
- [ ] Modified
- [ ] Rejected

#### Author Notes

The merge result passed 307 frontend tests, 26 order-service AI-related tests, and 7 Terraform mock tests. Frontend build and ESLint checks also passed. I subsequently completed local integration testing with the project's OpenAI key and reported that it passed on November 6 at 11:05.

---

## ARIFOVAS KRISTUPAS

### Date/Time

2026-11-03 00:27–00:31

#### Tool

Codex

#### Prompt/Command

Check whether the supplier seed CSV files are included in the Docker build and fix the missing resources. Copy the two required CSVs explicitly.

#### Output Summary

Added explicit Docker COPY inputs for the two supplier seed CSVs. Built the supplier image and checked that its application JAR contained both resources and that they matched the source files.

#### Action Taken

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

#### Author Notes

The issue came from a code review comment supplied in the chat. I requested the fix and then asked for explicit filenames rather than copying the entire CSV directory.

---

### Date/Time

2026-11-03 00:44–00:46

#### Tool

Codex

#### Prompt/Command

The label “Open now · Closes at 23:59” does not account for shops that operate 24 hours.

#### Output Summary

Updated supplier status labels and weekly schedules to recognise the existing 00:00–23:59 seed-data convention as 24-hour opening. Corrected the final-minute edge case in frontend logic and API filtering.

#### Action Taken

- [x] Accepted as-is
- [ ] Modified
- [ ] Rejected

#### Author Notes

I identified the incorrect display. The fix also addressed the associated 23:59 filtering behaviour. The transcript reports passing frontend and backend tests, TypeScript, and ESLint.

---

### Date/Time

2026-11-03 00:30–00:31

#### Tool

Codex

#### Prompt/Command

Check the supplier sorting logic and simplify it while keeping it understandable.

#### Output Summary

Explained duplicate variable declarations in the pasted comparator and compared two implementations. Updated the comparator to use explicit boolean comparisons, sorting open suppliers first and then alphabetically.

#### Action Taken

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

#### Author Notes

I questioned whether the shorter numeric conversion was less understandable and requested the explicit boolean version. The transcript reports that TypeScript and ESLint checks passed.

---

### Date/Time

2026-11-05 15:17–15:18

#### Tool

Codex

#### Prompt/Command

Diagnose ERR_MODULE_NOT_FOUND when running realtime-service/src/index.ts and check the persisted IDE run configuration in .run.

#### Output Summary

Identified that the IDE was launching TypeScript directly through Node instead of the service’s tsx development script. Copied the existing RealtimeService run-configuration template into .run so IntelliJ could load it.

#### Action Taken

- [x] Accepted as-is
- [ ] Modified
- [ ] Rejected

#### Author Notes

I clarified that the IDE configuration should be persisted in .run. The change reused the existing template. The transcript does not confirm a successful launch afterward.

## XU ZIHAO

## User Profile — Backend Implementation

### Date/Time:

2026-09-23 to 2026-09-29

### Tool:

Codex

### Prompt/Command:

Implement authenticated profile retrieval and updates, password changes, and profile photo upload, retrieval and removal. Add validation, error handling and automated tests.

### Output Summary:

Implemented profile retrieval and updates for name, email, phone number and faculty. Added password changes with current-password verification and refresh-token removal. Implemented profile photo processing, storage, retrieval, replacement and removal. Added controller, service and persistence tests.

### Action Taken:

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

### Author Notes:

Provided the backend endpoints used by the profile overview and editing pages. Users can retrieve and update their personal details, change their password, and upload, replace or remove their profile photo.

---

## Shared User Header — Frontend Implementation

### Date/Time:

2026-09-27 to 2026-09-29

### Tool:

Codex

### Prompt/Command:

Implement the shared user header and page layout, including navigation, account information, avatar display, credit balance display and responsive styling.

### Output Summary:

Implemented the shared header and user layout, navigation content, account controls, avatar fallback, credit balance display and notification button states. Added responsive styling, a skip-to-content link and component tests.

### Action Taken:

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

### Author Notes:

This contribution implemented the header components and display states. Live credit balance retrieval was added later.

---

## User Profile — Frontend Implementation

### Date/Time:

2026-09-29 to 2026-10-01

### Tool:

Codex

### Prompt/Command:

Implement the profile overview and editing pages. Connect profile updates, password changes and profile photo controls to the existing backend endpoints.

### Output Summary:

Implemented profile overview and editing pages with profile retrieval, editable name, phone number and faculty fields, password changes, and photo upload and removal. Updated profile navigation and added frontend tests.

### Action Taken:

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

### Author Notes:

Follow-up changes restored profile routes and refined the account interface. Password changes were connected to logout and login navigation.

---

## Courier Home Page — Frontend Implementation

### Date/Time:

2026-09-30

### Tool:

Codex

### Prompt/Command:

Implement the courier home page with errand cards, search, reward and expiry information, detail previews and responsive styling.

### Output Summary:

Implemented the courier home page using sample errands. Added search filtering, pickup and destination information, reward and expiry displays, detail dialogs and an ineligible state for the user's own requests. Added routing and frontend tests.

### Action Taken:

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

### Author Notes:

This contribution implemented the frontend preview.

---

## Credit Service — Accounts, Balances and Provisioning

### Date/Time:

2026-10-16 to 2026-10-18

### Tool:

Codex

### Prompt/Command:

Implement credit account creation, initial credit allocation and authenticated balance retrieval.

### Output Summary:

Implemented credit account persistence and the own-balance API. Added registration event publication and consumption, account initialization and duplicate-event handling. 

### Action Taken:

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

### Author Notes:

Enabled automatic credit account creation and initial credit allocation when users register. Provided an authenticated API for retrieving each user's own balance and prevented duplicate registration events from allocating credits more than once.

---

## Credit Service — Reward Reservation, Payment and Release

### Date/Time:

2026-10-16 to 2026-10-19

### Tool:

Codex

### Prompt/Command:

Implement reward reservation, payment on errand completion and reservation release on cancellation or expiry. Update balance retrieval and add tests for repeated operations, concurrent processing and failed transactions.

### Output Summary:

Implemented the reservation endpoint with RESERVED and INSUFFICIENT_BALANCE responses. Updated balance retrieval to include reserved and available credits. Added completion, cancellation and expiry handling, requester-to-courier credit transfers, reservation state updates and transaction recording. Added operation matching, duplicate-operation handling and automated tests.

### Action Taken:

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

### Author Notes:

Enabled credits to be reserved for an errand, transferred to the courier on completion, or released to the requester on cancellation or expiry. Updated balance retrieval to reflect reserved credits and added handling to prevent repeated operations from moving credits twice.

---

## Admin Dispute Resolution — Participant Responses

### Date/Time:

2026-11-06 to 2026-11-09

### Tool:

Codex

### Prompt/Command:

Implement the first two requested improvements: allow the other participant to submit a short response with their identity and timestamp, and display the complaint and response together on the existing admin order detail page.

### Output Summary:

Implemented response submission, persistence and frontend controls for the other participant while the dispute was open. Updated the admin order detail page to display the complaint and response together, including their authors and timestamps, alongside the order timeline and credit status. Extended backend and frontend tests.

### Action Taken:

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

### Author Notes:

The dispute implementation and its tests received further integration updates after the credit event changes.

## LI KEHAN

## Supplier CRUD — Backend and Admin Pages

### Date/Time:

2026-09-25 to 2026-09-26

### Tool:

Claude Code (Claude Opus 5.5)

### Prompt/Command:

Implement the supplier CRUD (create, list, edit, delete) for admins, following the requirements I set: the supplier details to manage (name, category, location, opening hours, image) and admin-only access. I chose the UI library (Base UI, after trying Mantine) and the NUS blue and orange colours.

### Output Summary:

Implemented the CRUD API with exception handling, a Flyway migration with seed data, controller tests, and the admin pages: routes, sidebar, listing, create and edit forms with validation, a preview card and toast notifications.

### Action Taken:

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

### Author Notes:

Use: implementation code, unit tests and boilerplate; learning support (I asked for explanations of DTOs, repositories, Flyway and role checks). I asked for layout and toast colour changes after reviewing the pages.

---

## Supplier Search, Filters and Admin Dashboard

### Date/Time:

2026-09-26 to 2026-09-30

### Tool:

Claude Code (Claude Opus 5.5)

### Prompt/Command:

Implement supplier search and category filtering, and the admin dashboard following our team's UI design. Then apply the review comments on PR #14 that I decided to accept.

### Output Summary:

Implemented the search endpoint and tests, filters kept in the URL, the overview dashboard (stat cards and suppliers table), weekly opening-hour editing with validation, and returning to the previous page. Moved the real supplier data into the seed migration.

### Action Taken:

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

### Author Notes:

Use: implementation code and unit tests. I chose which review comments to address, edited the SQL and comments myself, and removed the sample-data label.

---

## Supplier Image Upload

### Date/Time:

2026-10-01 to 2026-10-02

### Tool:

Claude Code (Claude Opus 5.5)

### Prompt/Command:

Change supplier images from pasting a URL to uploading from the admin's device (JPEG or PNG), with a simple choose, replace and remove field that only saves on "Save changes", as I specified.

### Output Summary:

Implemented the image upload and image endpoints, removed the URL option and simplified the field. Moved components into their pages and loaded order data through a hook.

### Action Taken:

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

### Author Notes:

Use: implementation code and refactoring; learning support (I asked how the images are stored and why generated file keys are used). I resolved a routing conflict with main.

---

## Supplier Service — Presentation Script

### Date/Time:

2026-10-02

### Tool:

Claude Code (Claude Opus 5.5)

### Prompt/Command:

Help me prepare my part of the milestone presentation on the Supplier Service: an order to present it in and a draft script describing what was built.

### Output Summary:

Suggested a presentation order and a draft script describing the implemented features.

### Action Taken:

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

### Author Notes:

Use: specific style writing (presentation wording). I checked each point against our code and rewrote the script in my own words; the design reasons in the talk are my own.

---

## Admin Login Redirect

### Date/Time:

2026-10-17 to 2026-10-19

### Tool:

Claude Code (Claude Opus 5.5)

### Prompt/Command:

Implement the redirect I specified: after login, admins go to the admin dashboard and other users go to the app. Explain how to verify it.

### Output Summary:

Implemented the redirect with tests and explained how to test it with a student and an admin account.

### Action Taken:

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

### Author Notes:

Use: implementation code, unit tests and test suggestions. I tested it manually and ran the full checks before pushing.

---

## NUS Outlet Supplier Data

### Date/Time:

2026-10-19

### Tool:

Claude Code (Claude Opus 5.5)

### Prompt/Command:

Add real NUS outlets as supplier seed data, replacing the sample suppliers.

### Output Summary:

Added 53 NUS outlets with locations, categories and opening hours to the seed data.

### Action Taken:

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

### Author Notes:

Use: boilerplate (seed data). I checked the data in my local database before opening the PR.

---

## Errand History and Request Again

### Date/Time:

2026-10-19 to 2026-10-21

### Tool:

Claude Code (Claude Opus 5.5)

### Prompt/Command:

Implement errand history and request-again from our design drafts, following my requirements: see past errands, request one again with a warning if the same request is in progress, edit before posting, separate requester and courier views following the home page role switch, no request-again for couriers, and a cancelled status.

### Output Summary:

Implemented the history page, request-again with the duplicate warning and editable form, the requester and courier views, and the cancelled status, on top of a teammate's errand creation branch so the code matched.

### Action Taken:

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

### Author Notes:

Use: implementation code and tests. I asked for layout and wording changes after reviewing the screens.

---

## Errand History — Search and Layout Improvements

### Date/Time:

2026-10-23

### Tool:

Claude Code (Claude Opus 5.5)

### Prompt/Command:

After syncing with main, apply the changes I decided on for errand history: search by item or location instead of the filter, follow the home role switch, show the expiry time clearly, and use more of the page width. Add demo accounts, sample errands and category images.

### Output Summary:

Implemented the search, role following and layout changes, removed a stray focus outline, and added the demo data and category images.

### Action Taken:

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

### Author Notes:

Use: implementation code and boilerplate (demo data). I decided the layout details (credits, status, expiry time position).

---

## Errand History and Real-time Chat — Presentation Diagrams and Scripts

### Date/Time:

2026-10-23

### Tool:

Claude Code (Claude Opus 5.5)

### Prompt/Command:

Draw request-flow diagrams and an image of the planned real-time chat, and draft scripts for the errand history and chat slides.

### Output Summary:

Created SVG diagrams, a chat lifecycle image and draft scripts in the order of our slides.

### Action Taken:

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

### Author Notes:

Use: specific style writing and formatting. The chat lifecycle (opens when accepted, closes after delivery, history kept) was my requirement. I rewrote the scripts myself, and the reasoning in them is my own.

---

## Errand History — Review Fixes

### Date/Time:

2026-11-02 to 2026-11-03

### Tool:

Claude Code (Claude Opus 5.5)

### Prompt/Command:

Apply the teammates' review comments I accepted on my errand history work.

### Output Summary:

Kept the errand search filter during page navigation and in sync with the search box, and updated the supplier seeding commands in the docs.

### Action Taken:

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

### Author Notes:

Use: implementation code and documentation. I ran the CI formatting checks before pushing.

---

## Proof of Delivery — Implementation

### Date/Time:

2026-11-05 to 2026-11-06

### Tool:

Claude Code (Claude Opus 5.5)

### Prompt/Command:

Implement Proof of Delivery (FOC-49) following my requirements: after pick-up the courier marks the errand delivered with photos, the requester can only confirm receipt after that, and photos are stored in S3 like our other images.

### Output Summary:

Implemented a DELIVERED status, photo upload to S3 with links to view them, and the confirm-after-delivery rule, with the matching Floci, Compose and Terraform configuration and tests. Fixed the e2e configuration, where supplier-service had no events topic.

### Action Taken:

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

### Author Notes:

Use: implementation code, tests, configuration and debugging; learning support. I asked Claude Code about the architecture concepts for storing photos securely (separate photo table, private bucket, short-lived links, removing location data) to understand the approaches, then made the design decision myself. I reworded the comments and tested with two accounts.

---

## Proof of Delivery — Review Before Submit

### Date/Time:

2026-11-05

### Tool:

Claude Code (Claude Opus 5.5)

### Prompt/Command:

Change the photo flow to my new requirement: the courier reviews 1 to 5 photos (adding or removing any) before submitting, and nothing can change afterwards. Explain why one photo failed to upload.

### Output Summary:

Implemented review-before-submit with an all-or-nothing upload. Found that the upload failed because my local order service was still the old version and the new migration had not run.

### Action Taken:

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

### Author Notes:

Use: implementation code and debugging. Restarting the service fixed the upload.

---

## Real-time Chat — Implementation

### Date/Time:

2026-11-06

### Tool:

Claude Code (Claude Opus 5.5)

### Prompt/Command:

Implement real-time chat (FOC-47) following my requirements: the requester and courier can chat once the errand is accepted, the chat becomes read-only after confirmation, and the history is kept. Use our existing order service and realtime service.

### Output Summary:

Implemented message storage in the order service, the events it publishes, delivery through the realtime service to the two participants, the chat panel and tests.

### Action Taken:

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

### Author Notes:

Use: implementation code and tests; learning support. I asked Claude Code about the architecture concepts for storing chat messages and their events to understand the approaches, then made the design decision myself. I changed the closed-chat wording.

---

## Real-time Chat — Live Updates, Time Labels and Seen Indicator

### Date/Time:

2026-11-06 to 2026-11-07

### Tool:

Claude Code (Claude Opus 5.5)

### Prompt/Command:

Fix messages only appearing after a page refresh, and add the features I asked for after testing: time labels only after a gap (like WeChat) and a "Seen" indicator for the sender.

### Output Summary:

The refresh problem was the realtime service not being started in IntelliJ; it also found and fixed Floci keeping old subscription filters and the socket refreshing its token on every network error. Implemented the time labels and "Seen".

### Action Taken:

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

### Author Notes:

Use: debugging and implementation code. I verified the fixes by chatting from two browsers.

---

## Real-time Chat — Photos, Videos and Testing Fixes

### Date/Time:

2026-11-07 to 2026-11-09

### Tool:

Claude Code (Claude Opus 5.5)

### Prompt/Command:

Fix the issues I found in testing (second photo misaligned, the courier side needing a refresh, "Seen" appearing slowly) and add the photo and video messages I asked for, with "Seen" counted only while the chat is actually being viewed.

### Output Summary:

Fixed the layout and live updates, made "Seen" depend on the chat being on screen in a focused window, and added photo (up to 5 MB) and video (up to 20 MB) messages with tests.

### Action Taken:

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

### Author Notes:

Use: debugging and implementation code. Order-service (112), realtime (13), frontend (301), e2e (17) and Terraform tests passed.

---

## Proof of Delivery — Presentation Slide

### Date/Time:

2026-11-10

### Tool:

Claude Code (Claude Opus 5.5)

### Prompt/Command:

Create a slide for our "Nice to Have" section showing the Proof of Delivery feature, in the same style as our Real-time Chat slide.

### Output Summary:

Created a slide describing the delivery steps, the photo rules and an example screen, with speaker notes.

### Action Taken:

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

### Author Notes:

Use: specific style writing and formatting. I checked the content against the implemented feature.

---

## Real-time Chat — Attachment Link Renewal

### Date/Time:

2026-11-10

### Tool:

Claude Code (Claude Opus 5.5)

### Prompt/Command:

Fix a reviewer-reported bug: chat photo and video links expire 10 minutes after the chat closes because refreshing stops.

### Output Summary:

A closed chat with attachments now refreshes every 60 seconds, and links with more than 2 minutes left are kept so photos do not reload. Added tests and confirmed the key test fails without the fix.

### Action Taken:

- [x] Accepted as-is
- [ ] Modified
- [ ] Rejected

### Author Notes:

Use: debugging and implementation code. Frontend tests (304), linting, type checking, the build and the full Gradle check passed. I replied to the reviewer.

---

## Merge Conflict Resolution — Proof of Delivery

### Date/Time:

2026-11-10

### Tool:

Claude Code (Claude Opus 5.5)

### Prompt/Command:

Explain and help resolve the merge conflicts between main and proof-of-delivery (PR #59).

### Output Summary:

Resolved 11 conflicting files and fixed problems Git could not detect: duplicate Flyway versions, duplicate upload-size handlers and multipart settings, and outdated test cleanup lists. It also pointed out that disputes did not recognise the new DELIVERED status.

### Action Taken:

- [ ] Accepted as-is
- [x] Modified
- [ ] Rejected

### Author Notes:

Use: debugging and code integration; learning support. I asked Claude Code about the possible approaches for handling this, then decided myself to allow disputes on delivered errands and pause delivery during an open dispute, and informed the dispute feature's author. I ran the merge myself; 148 order-service, 17 e2e, 322 frontend and 7 Terraform tests passed.

---

## Merge Conflict Resolution — Real-time Chat

### Date/Time:

2026-11-10

### Tool:

Claude Code (Claude Opus 5.5)

### Prompt/Command:

Help resolve the merge conflicts between main and the chat branch after proof of delivery was merged.

### Output Summary:

Resolved 6 conflicting files, renumbered the chat migrations to V7 and V8, raised the shared upload limit to 20 MB for videos, and updated two dispute tests that now render the chat.

### Action Taken:

- [x] Accepted as-is
- [ ] Modified
- [ ] Rejected

### Author Notes:

Use: debugging and code integration. I ran the merge myself; 160 order-service, 17 e2e, 340 frontend, 7 Terraform and 13 realtime tests passed.
