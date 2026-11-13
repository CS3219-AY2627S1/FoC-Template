<!--
AI Assistance Disclosure:
Tool: Claude Code (Claude Opus), date: 2026-11-01.
Scope: Formatted the author's prompts into this archive file.
-->

# Prompt archive: 010

Received 2026-10-11 – 2026-10-12 (Asia/Singapore).

## Prompt 1

```text
I need to implement a refresh workflow. So what happen is that previously, we
only implemented until user login, then we give them a JWT token that lasts for
15 minutes. the problem is that then the users will have to keep logging in
every 15 mionutes. To fix this problem, we will use a refresh token approach.
So, refresh token will last longer (e.g. 1 week), JWT token lasts shorter, when
JWT token is expired, the browser will call the /refresh endpoint, attach it
with the refresh token on user's behalf to request for a new JWT token, this
can keep the session going and user don't need to keep logging in every 15
minutes.
```

## Prompt 2

```text
1. RefreshToken schema is like this:
id (PK)
userId (FK)
tokenHash (unqiue)
expiresAt (datetime)
revokedAt (datetime)
createdAt (datetime)

index on userId for fast lookup

2. no, we should never store the raw token, keep a hash (safer), since the
token itself is already randomised and quite long, a bit the hard to
brute-force.

3. Probably 7 days for now. it should be configurable so put it as an ENV VAR

4. Refresh token go back in a cookie, httpOnly so Javascript cannot read it,
path /users

5. logging in again revoke the old refresh token and issue a new one

6. yes

7. 401 unauthorised I think, correct me if I am wrong

8. hmmm, great question, I think, if we rotate the refresh token each time, the
user session can last for a long time without login right, only whn he doesn't
use it / inactive for a straight 7 days, he will need to login again, sure
let's do with the rotation.
```

## Prompt 3

```text
ok
```
