<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus), date: 2026-11-01.
Scope: Formatted the author's prompts into this archive file.
-->

# Prompt archive: 019

Received 2026-10-19 (Asia/Singapore).

## Prompt 1

```text
implement a script of CLI admin bootstrap, this script will be run in an
interactive terminal.
Workflow:
1. start an interactive terminal
2. check if the admin is already initialised, if yes, exit, else continue
3. user will type in their password through the terminal input
4. script wil then create a new user account, with the provided details
(username, email, firstname, lastname, etc) with the given password --> calls
bootstrapAdmin functoin in adminService
5. make sure that they deploy the same rules as a normal user register
workflow, and the same business logic

on the other hand, please create a adminService and create a bootstrapAdmin
function, that creates an Admin account given the data, and also reuses the
same user registration business logic flow,
after createing the user, bootstrapAdmin will then append a new audit record to
adminRoleChange and also initialise the systemBootstrap row
```

## Prompt 2

```text
1. yes, they should be hidden while typing. Good point, uh, no don't accept them
2. yup
3. yeah absolutely, every account is by default a USER
4. yeah make sure use creation, systemBootsrap row and the audit record are all
done in one transaction, we don't want any inconsistencies in our records
5. yes, very important to ensure that nothing is changed
6. use a pg_lock, to make sure no two people is modifying the database at the
same time. The second person who's later, eventually when it got to their
turn, the admin would be initialised, and they would be receiving an erro
message instead
```
