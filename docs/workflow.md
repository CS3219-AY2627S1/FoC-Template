# Development workflow

How we track work and get code into the repository. Short version: every change starts as a Linear issue, lives on a branch off `dev`, and lands through a pull request into `dev`.

Tracking happens in Linear: <https://linear.app/nus-relay> (team `REL`).

## Requirements

The product backlog from D1 (`Product-Backlog.pdf`) is the source of truth for what we build. Every requirement in it exists as a Linear issue whose title starts with the requirement id, for example `F3.3.1 Errand state machine with permitted transitions only`. The issue body quotes the requirement text, priority and planned sprint.

When you change something, find the requirement first, work against its issue, and mention the requirement id in the pull request. If a requirement turns out to be wrong or missing, change the backlog document and the issue together.

## Branches

- `main` holds what we hand in. Nobody pushes to it directly.
- `dev` is the integration branch. Feature branches start from `dev` and are merged back into `dev` through a pull request.
- Feature branches are named `<type>/rel-<n>-<short-description>`:

  | Type    | Use for                                    | Example                              |
  | ------- | ------------------------------------------ | ------------------------------------ |
  | `feat`  | new behaviour, usually a requirement       | `feat/rel-42-reserve-credits`        |
  | `fix`   | a bug                                      | `fix/rel-87-double-accept`           |
  | `chore` | maintenance that is neither feature nor bug | `chore/rel-176-workflow-docs`       |

  `rel-<n>` is the Linear issue id. It has to be in the branch name so Linear links the branch and the pull request to the issue. Linear's "copy git branch name" gives you `rel-42-<title>`; put the type in front of it.

Keep branches short-lived. Rebase or merge `dev` into your branch before opening the pull request if it has drifted.

## Commits

`<type>: <short description>`, with one of `feat`, `fix`, `chore`, `docs`, `refactor`, `test` as the type. Lower case, imperative, no trailing period.

```
feat: reserve credits before creating an errand
fix: reject second courier on an accepted errand
docs: describe the supplier seed format
```

Commit under your own name and email. Individual contribution is graded from the git history.

## Pull requests

- Target `dev`. Only `dev` is merged into `main`, at a milestone.
- Title follows the commit format (`feat: ...`). The template asks for the Linear issue and the requirement id; fill both in.
- One approval from another team member is required. The commit lint check has to pass.
- The author merges after approval and deletes the branch.

## Linear

### Structure

- One team, `REL`. Issue ids look like `REL-42`.
- One project per service: User Service, Supplier Service, Order Service, Credit Service, Web Client, Admin Dashboard, Credit Recommendation and Platform (containers, deployment, async messaging). Each project carries the top-level requirement text in its description and the milestones D2, D3 and D4 with their dates.
- Requirement groups such as `F1.1` are parent issues; the requirements below them (`F1.1.1` to `F1.1.10`) are sub-issues. The parent shows the progress of the group.
- Cycles are our sprints: Sprint 1 until 4 Oct, Sprint 2 until 25 Oct, Sprint 3 until 15 Nov. Issues are already in the sprint the backlog plans them for; a parent sits in the sprint of its earliest sub-issue. Unfinished issues roll over to the next sprint automatically.
- In sprint views, hide sub-issues to work on the groups and expand a group to see its requirements. Show sub-issues when you want the flat list.

### Status

`Backlog` (not planned), `Todo`, `In Progress`, `In Review`, `Blocked`, `Done`, plus `Canceled` and `Duplicate`. `Blocked` is for waiting on another service, a decision or something outside the team; say what you are waiting for in a comment.

The GitHub integration moves issues for you: pushing a branch with the issue id sets `In Progress`, opening a pull request into `dev` sets `In Review`, merging it sets `Done`. Move issues by hand only when that flow does not apply.

### Labels

Four groups, one label from each where it makes sense:

- Type: `functional`, `non-functional`, `nice-to-have` (set from the backlog)
- Kind: `feature`, `bug`, `chore`, `docs`, `refactor`, `test` (same words as the commit types)
- Service: `user-service`, `supplier-service`, `order-service`, `credit-service`, `web-client`, `admin-dashboard`, `recommendation`, `platform`
- Area: `backend`, `frontend`, `infra`, `testing`

### Creating issues

Use the templates: "Bug report" for something that behaves differently from a requirement, "Tech task" for refactoring, tooling or documentation, and "Requirement" if the backlog grows. Put the issue in the project of the service it belongs to and in the current cycle if it should be done this sprint.

### Views

Saved in the team sidebar: "Board by service", "Current sprint", "Requirements coverage" and "Bugs & blocked". "My issues" shows what is assigned to you.
