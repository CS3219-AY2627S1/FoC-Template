<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-5), date: 2026-11-11
Scope: Generated and condensed this log from the recorded chat history and repository audit.
-->

# AI Usage Log

Tool: OpenAI Codex (GPT-5)  
Recorded work: Supplier Service chats, 2026-09-26 to 2026-10-02; disclosure updates, 2026-11-11.

This is not yet a complete team log. Other AI use must be appended before submission.

## 1. Project setup and explanations

Mode: learning/setup assistance; Spring Initializr generated the base project.

Prompts included:

> how to generate a spring project

> how to paste the contents of the generated folder into supplier service? vscode is not letting me paste

> what should i do now after pasting the generated files into supplier service

> the dropdown list of configure java runtime only shows user-service. am i supposed to create a project?

> java -version still shows 25, do i need to reload or sth, i created a new terminal alr

> what is java_home variable for? whats the diff between that and changing path variable? why need both java -version and java_home to point to 17

> JAVA_HOME is not letting me point it to jdk 17, the pop up only allows me to select file from directory, not folder

> theres no JAVA_HOME under path, am i supposed to add it

Key outcome: explained Initializr generation, Maven import, Java 17, `PATH`, `JAVA_HOME`, and
VS Code project/runtime configuration.

## 2. Testcontainers implementation and debugging

Mode: implementation generation and debugging.  
Affected files: `supplier-service/pom.xml` and `SupplierApplicationTests.java`.

Prompts:

> i tried running mvn test and it failed. can u read the error msg on the terminal in vscode?

> what is testcontainers used for, whats the diff between using it and without it

> can u help implement the changes for testcontainers u metioned previoulsy

Key outcome: diagnosed the missing test datasource; added PostgreSQL/JUnit Testcontainers
2.0.5; corrected the Testcontainers 1.x/2.x classpath mismatch; verified `mvn clean test` with
one passing PostgreSQL 16 application-context test.

## 3. Docker, datasource, and environment configuration

Mode: boilerplate/configuration generation, debugging, and explanation.  
Affected portions: Supplier block in `compose.yaml`, Supplier entries in `.env.example`, and
initial datasource/JPA settings in `supplier-service/src/main/resources/application.properties`.

Prompts:

> so cannot use testcontainers for local dev? how does user service do it

> so is the docker compose file same as running docker run? also what were these lines u told me to add for: spring.datasource.url=jdbc:postgresql://${DB_HOST:localhost}:${DB_PORT:5432}/${DB_NAME:campuscouriers_supplier} spring.datasource.username=${DB_USERNAME} spring.datasource.password=${DB_PASSWORD} is the DB_USERNAME, etc. supposed to be stored in .env file?

> where should docker compose file be? under supplier-service folder or under root folder? whats the diff between docker compose file and dockerfile

> where should env file be? under root or supplier service? can u help create the docker compose file and add the env variables

> what do these mean: ports: - "${SUPPLIER_DB_PORT:-5433}:5432" test: -CMD-SHELL - pg_isready -U ${SUPPLIER_DB_USERNAME} -d ${SUPPLIER_DB_NAME}

> give me the commands to start the supplier service

> is it possible to run docker compose from supplier-service and not root

> what happens if u dont provide env variables in terminal? will it have default values

> is there a shorter command to set all these env variables?

> can u give a one line command for macos/linux also

> how about for powershell? what if i set all env variables in one line and run maven in next line

Key outcome: generated the initial persistent PostgreSQL Compose service, environment
template, health check, port/volume configuration, and datasource settings; explained the
difference between test and development databases and how environment interpolation works.
`docker compose config --quiet` passed.

## 4. Supplier README documentation

Mode: documentation generation.  
Affected file: `supplier-service/README.md`.

Prompts:

> can u update README under supplier service to include instructions on how to start supplier service

> can u include commands for other OS also, like macOS and linux. just include instruction for docker compose under root, no need under supplier-service. what does docker destop with docker compose mean? doesnt having docker desktop mean docker compose should work

> can u include commands for mvn also. so have both mvn wrapper and mvn commands

Key outcome: documented prerequisites, root Compose commands, Windows/macOS/Linux environment
syntax, Maven and Maven Wrapper commands, testing, shutdown, and troubleshooting.

## 5. API review and handoff

Mode: codebase review, explanation, and summarization.

Prompts:

> what to do now after mvn test passes? also can u check the api call names in user service?

> i committed what i have changed so far, can u summarise what ive done and make a plan of what should be done next, to paste into another chat

Key outcome: compared User Service conventions and summarized Supplier setup commit `c506c15`.
Any suggested interfaces, prioritization, or sprint planning from these responses must be
independently decided by the team under Appendix 2.

## 6. Supplier JWT security

Mode: implementation, debugging, and explanation.  
Affected files: `supplier-service/.../config/SecurityConfig.java` and
`supplier-service/src/main/resources/application.properties`.

Prompt:

> i need to edit the security config for supplier service.
> what my teammate said:
> btw for the other services that need to verify the JWT token of the user (e.g. supplier
> service needs to verify that user is Admin), you can get the public key from
> `https://<user-service>/.well-known/jwks.json` to first verify the token legitimacy, and then
> extract the claims which currently include the account id from `sub` and the account type
> (i.e. Admin and Student) from `type`
>
> if you are using Spring Boot, remember to include the dependency
> `spring-boot-starter-oauth2-resource-server` for that
>
> can u help to edit the SecurityConfig file to fulfill the requirements:
> GET endpoints for supplier, category, building allowed for both users and administrators
> POST endpoints to create/update suppliers/categories/buildings only allowed for administrators
> can u also explain what csrf means

Key response: enabled Spring's JWT resource server, configured the User Service JWKS URL,
mapped the JWT `type` claim to authorities, required authentication for reads, and required
`Administrator` for writes. Maven compilation succeeded. Follow-up responses explained CSRF,
JWT verification/authorization, local User/Supplier Service startup, and manual 401/403 tests.

## 7. Supplier container and seed workflow

Mode: boilerplate implementation and documentation.  
Affected files: `supplier-service/Dockerfile` and `supplier-service/README.md`.

Prompts:

> can u create a dockerfile for supplier service

> if the supplier service is run inside the container, do the commands for data seeding still remain the same

> can u make the relevant changes, the docker compose is updated with the commands for all services

Key response: generated a Java 17 multi-stage, non-root image and replaced host Maven seeding
instructions with one-off Compose commands using `supplier-db:5432`.

## 8. Supplier CORS fix

Mode: debugging, implementation, and tests.  
Affected files: `SecurityConfig.java`, `SecurityConfigTest.java`, `application.properties`,
`compose.yaml`, and `.env.example`.

Prompt:

> theres CORs error on frontend when requesting supplier service endpoints, can u fix it

Key response: enabled Spring Security CORS with a configurable origin allowlist, wired the
Compose environment, added allowed/untrusted-origin tests, and verified all 55 tests passed.

## 9. Docker command explanations

Mode: learning support and documentation.

Prompts:

> give me commands for starting frontend and supplier service usign docker

> give me command to test supplier service in terminal

> how to stop the services

> diff between stopping and remove containers

Key response: provided Compose build/start/log/stop/down commands, Maven/API test commands,
and explained that `stop` preserves containers while `down` removes them but keeps volumes.

## 10. Initial supplier data seeding

Mode: implementation, tests, debugging, and documentation.  
Affected files: seed importer classes/tests, `pom.xml`, `application.properties`, and
`supplier-service/README.md`.

Prompts:

> can u refer to the doc and implement the seeding of initial supplier data, and show me the plan and workflow of the initial data seeding

> can u remove the BUILDING_ALIASES from supplierseedimporter, no need to have this. i replaced the supplier-seed-data with the updated csv.

> after making changes to csv, i need to re-seed the initial data. what are the commands to follow? i need to delete all exisiting data in supplier db

Key response: implemented a configuration-gated, transactional CSV importer with validation,
idempotent duplicate handling, tests, and PowerShell/macOS/Linux clean-seeding instructions.
The user supplied and later replaced the CSV data itself.

## 11. Supplier deactivation and reactivation

Mode: implementation, tests, and debugging.  
Affected files: `SupplierController`, `SupplierService`, `Supplier`, `SecurityConfig`, and their
controller/service/security tests.

Prompts:

> can u implement the patch endpoint for deactivating suppliers

> can u implement for reactivating a supplier also

Key response: added Administrator-only `PATCH /suppliers/{id}/deactivate` and
`PATCH /suppliers/{id}/reactivate`, persisted `INACTIVE`/`ACTIVE` state changes, updated CORS,
and added regression tests. Verification completed with 59 full-suite tests and 29 focused tests.

## 12. Local Docker and browser usage

Mode: debugging/explanation only; no code files changed.

Prompts:

> i made new changes to the code, do i stop the current docker containers and restart? can u give me commands

> do i need to rerun supplier seed command?

> how to open the app with w different users on my laptop? do i have to open in 2 separate windows

Key response: explained rebuilding with `docker compose up -d --build`, persistent database
volumes and idempotent supplier seeding, and using separate browser profiles/incognito sessions.

## 13. Supplier administration endpoints

Mode: implementation, tests, debugging, and documentation.  
Affected files: Supplier category/building controllers, DTOs, entities, repositories, services,
exceptions, security configuration, tests, and README.

Prompts included:

> can u implement these endpoints now:
> GET, PUT /categories/{id}
> POST /categories/{id}/deactivate
> POST /categories/{id}/reactivate
> GET, PUT /buildings/{id}
> POST /buildings/{id}/deactivate
> POST /buildings/{id}/reactivate

> is this currently ensured: if reactivating a supplier, the category and building of it must be active as well, if not return an error

Key response: implemented update, retrieval, deactivate/reactivate, inactive-listing, duplicate
validation, active-supplier guards, and combined inactive-reference errors with tests.

## 14. Chat UI fixes

Mode: debugging, implementation, and tests.  
Affected files: frontend chat API/preview and chat pages.

Prompts:

> the chat doesnt jump right to the bottom when user sends a message, user still has to manually scroll down a bit to reach the bottom of chat. can u fix it.

> theres a bug with the chat ui:
> when a new message arrives, the unread messages icon increases, and the latest message appears in chat preview, and chat gets moved to top of chats page. but after clicking into chat and exiting back to chats page, the unread messages icon doesnt disappear and the specific chat is not at the top of the chats page anymore. can u fix this issue

Key response: corrected message scrolling, live preview ordering, and unread-state reconciliation.

## 15. Admin dashboard integration and responsive UI

Mode: implementation, refactoring, debugging, and tests.  
Affected files: frontend admin page, Supplier/User API clients, auth guards, navigation/header
components, icons, error pages, and tests.

Prompts included:

> ok can do the integration of admin dashboard with admin supplier service endpoints

> can u now wire the admin dashboard to other service endpoints, like order service?

> can u make the search bar for errands page in admin dashboard only for order item or ID, and add a filter for supplier. can u add sort by lowest credits and oldest order also.

> it seems that the admin dashboard is not responsive when changing window size, as compared to user home where resizing window will cause layout to change to fit to the window size. can u fix it?

> can u add a "user home"/"admin dashboard" button to the side of the user profile icon on the app header instead of parking it under user icon

Key response: connected Supplier, Order, and User Service data; added guarded routes, filters,
pagination, summaries, responsive layouts, cross-navigation, validation, error handling, and
regression tests. The final recorded frontend run passed lint, production build, and 131 tests.

## 16. Chat Service implementation

Mode: implementation, tests, debugging, documentation, and learning support.  
Dates: 2026-11-08 to 2026-11-10. Affected files: `chat-service/**`, Chat entries in
`.env.example` and `compose.yaml`, and the Chat outbox connector/catalogue under `debezium/`.

Prompts included:

> can u implement the chat service based on what u told me. use the sequence number approach. dont touch the frontend first.

> can u modify the code so that chat remains open for 30 min after errand is completed.

> can u help implement the conditional check constraint to the db

Key response: implemented the FastAPI/PostgreSQL chat service, Alembic migrations, authenticated
REST/WebSocket messaging, one-time tickets, per-conversation sequence allocation, retry
deduplication, lifecycle Kafka projection, 30-minute completion grace period, transactional
message outbox, and tests. The team remains responsible for independently validating the
pre-existing requirements, interfaces, schema, and security decisions.

## 17. Chat notification integration

Mode: implementation, tests, debugging, and documentation. Affected files:
`notification-service/**` files for chat events and notification persistence/response, plus Chat
outbox integration files.

Prompts included:

> can u implement the backend changes required for chat service integration with notif service, dont touch frontend first. and resolve the port conflicts also

> can u help implement the change in format of notif response to include "data" field, and chat message notif to include conversationId under data

> can u make the changes required for this: return messageId in notif response for frontend to retrieve message from chat service. dont modify frontend yet.

Key response: published and consumed `chat.message.created`, persisted receiver-specific
notifications, added typed notification `data`, message/conversation identifiers, exact-message
retrieval, and conditional database constraints. Tests and container configuration were updated.

## 18. Chat frontend integration

Mode: implementation, refactoring, debugging, and tests. Affected files: frontend Chat pages/API,
notification provider/bell/banner files, errand-details integration, navigation, types, and tests.

Prompts included:

> can u implement the changes required for frontend for chat service, as mentioned above, and wtv backend changes that needs to be done as mentioned previously (eg. endpoint to get list of chats belonging to user)

> can u add a feature where if user is in the chat but not at the bottom of chat and when new message arrives, show a small icon indicating new message that user can click to go to bottom of chat

> can u make each chat in chats page show a small icon indicating number of unread messages in that chat?

Key response: added chat list/conversation pages, live WebSocket messaging, notification banners
and previews, unread indicators, read-state handling, scrolling behavior, read-only lifecycle UI,
and errand titles. The recorded frontend verification passed 131 tests and a production build.

## 19. Expiry, ports, and cloud routing

Mode: debugging, implementation, tests, and configuration maintenance. Affected files:
`chat-service/main/lifecycle.py`, lifecycle tests/docs, `.env.example`, `compose.yaml`,
`frontend/src/features/chat/chat.api.ts`, and `k8s/app/ingress.yaml`.

Prompts included:

> the updated code now has a errand expired event. are there any changes to be made to chat service?

> can u implement the endpoint fix and relevant changes needed

> commands to rebuild containers locally

Key response: handled `errand.expired.resultingStatus`, resolved local Chat/RAG port collisions,
diagnosed the ALB path-precedence issue, and moved errand conversation lookup to
`GET /conversations/by-errand/{errandId}`. Verification passed 15 Chat tests, 131 frontend tests,
the frontend build, and Kustomize rendering.

JSON note: `debezium/connectors/chat-outbox.json` is disclosed here but has no file-header comment
because JSON does not permit comments and adding an artificial property could alter connector
configuration.

## 20. Supplier seed-data cleanup and local operations

Mode: data editing, debugging, and operational guidance.  
Date: 2026-10-01 to 2026-10-02. Affected file:
`supplier-service/src/main/resources/seed/supplier-seed-data.csv`.

Prompts included:

> can u help replace the image urls in the supplier-seed-data csv under resources/seed/ with the raw links instead

> can u recategorise cheers, octobox and fairprice stores under the category "Convenience Stores", and recategorise co-op stores under "Retail" in the csv?

> ok, retry again and replace Food/Coffee with Cafés & Beverages

> give me the commands to delete volume for supplier db, i want a fresh copy of db, then give me commands to seed supplier db

> give me command to start all services

Key response: changed six GitHub `blob` image URLs to raw image URLs; recategorised six
convenience stores, two Co-op stores, and 19 café/beverage suppliers; verified all 86 CSV rows;
and provided Docker Compose reset, seed, verification, and startup commands. Image-storage
selection discussions are intentionally excluded at the user's request.

CSV note: the affected CSV has no file-header attribution because its importer requires the exact
header row first and CSV provides no safe comment syntax. This log records the attribution instead.

## 21. Initial Supplier Service CRUD, retrieval, and handoff documentation

Mode: implementation, tests, debugging, explanations, and documentation.  
Dates: 2026-09-26 to 2026-09-30. Affected files: Supplier Service category, building,
and supplier entities, DTOs, repositories, specifications, services, controllers, exceptions,
tests, `CONTEXT.md`, and `SEED_IMPORT_HANDOFF.md`.

Prompts included:

> can u proceed with implementing category and building foundations, and then implement category and building creation

> now that categories and buildings are done, can u implement the supplier creation part

> can u implement the retrieval of category/building/supplier listings (GET endpoints)

> can u implement the update supplier functionality? what endpoints does this need

> can u summarise the workflow for seeding initial supplier data into a file

Key response: generated the initial creation and retrieval layers for categories, buildings,
and suppliers; added supplier search/filter/pagination, supplier detail and full update behavior,
case-insensitive uniqueness for `(name, building)`, validation and Problem Detail handling,
controller/service/PostgreSQL repository tests, and concise API/seeding handoff documentation.
The recorded full suite after supplier update passed 47 tests. Requirements and design choices
remain the team's responsibility under Appendix 2.

## 22. Initial supplier seed CSV generation

Mode: data generation and scripting. Date: 2026-09-10. Affected retained file:
`supplier-service/src/main/resources/seed/supplier-seed-data.csv`.

Prompts (pasted supplier table omitted because it is represented by the CSV):

> this is the supplier seed data that we're supposed to extend. how am i supposed to do it?
> can u auto populate the csv with more suppliers from NUS or write a script to help populate it?

> can u list out the websites / sources you obtained the supplier info from? can u also add more
> suppliers to the csv, eg. canteens/food courts in nus, and other fnb/retail stores in nus
> outside of utown also

> the supplier data extended csv only has 44 records

> can u add all suppliers listed in the above page? the newest csv still doesnt have all listings
> on the nus website u provided

> are u sure u added everything? i dont see the deck, eureka taste, frontier, etc. in the csv.
> also anna soup spoon is a duplicate record, it appeared in line 2 already

Key response: ChatGPT generated successive extended CSVs and a rerunnable Node.js helper,
using NUS UCI retail/dining pages, NUS Libraries, UTown Residence, NUS Co-op, and the NUS Campus
Map. Later responses corrected missing Kent Ridge outlets and duplicate name/building pairs. The
team subsequently reviewed and edited the retained seed CSV.

CSV note: no file-header comment was added because the importer requires the exact CSV header as
the first row and CSV has no safe comment syntax. This entry provides the file-level attribution.
