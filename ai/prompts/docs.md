# Timestamp: 2026-11-09
# Key Prompt:

Key implementations details:
1. Document only the current state of the API.
Where anything relates to old paths or updated content, show only the updated paths and content; never show the change from old to new. Remove "moved from", "previous snapshot", and old version-by-version changelog entries; keep the current snapshot and current known inconsistencies. e.g The SSE stream lives at GET /api/notifications/stream and no longer exists under /api/errands.

2. Quick Start must create the profile so credit allocation happens.
Create the required profile with PATCH /api/user/me (optional JPG/PNG profile-image upload), verify it with GET /api/user/me, then check the credit balance. The initial 100 credits allocate asynchronously from UserRegistered; profile creation itself does not allocate credits. Retry /api/credit briefly if the allocation has not completed yet.

3. Cookie lifetimes and session lifecycle are documented from the auth controller.
relay_access 15 minutes (Max-Age=900 seconds), relay_id 15 minutes (Max-Age=900 seconds), relay_refresh a session cookie with no Max-Age or Expires. The session lifecycle section states the 15-minute expiry and the refresh flow via /api/auth/refresh. Verified against user-service/auth/src/controllers/auth.controller.ts; no application code is changed.

4. First profile creation publishes UserRegistered; credit allocates asynchronously.
Polling guidance begins after profile creation. Credit estimation is triggered when the user requests an estimate, not automatically on every errand creation.

5. Attribute all AI-assisted files to relevant LLM models.
Headers are added to all files. Exclusions are preserved. Obsolete preview paths are not recreated as files; current equivalents are recorded instead.

6. Usage-log.md Show the deepest directory path before the files; if there are duplicates, keep one only. Same-named files in different directories are kept because they are separate files; parent directories already declared above are not repeated.

7. Usage-log.md uses - list markers, not ### headings.
Every ### heading is changed to a - entry; file paths are preserved. No ### headings remain in ai/usage-log.md.

8. Documentation only: no application code or API behaviour changes.
The work corrects and restructures docs/API.md and ai/usage-log.md only. No new endpoints, routes, or API behaviour are introduced.

# Usage Scenario:
Generated initial documentation, amend the relevant changes made to our codebase and update the documentation as we progress.