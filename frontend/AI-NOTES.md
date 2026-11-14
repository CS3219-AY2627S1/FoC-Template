<!--
  AI Assistance Disclosure:
  Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
  Scope: Generated UI mockup component AI-NOTES.md from team-authored blueprint.md.
         Visual/layout implementation only. No requirements, architecture, or
         schema decisions were made by the AI tool.
  Author review: <pending — team member to sign>
-->

# AI usage log — `foc-mockup/`

Paste this into `/ai/usage-log.md`.

**Tool:** Claude Code (model: claude-opus-5)
**Date:** 2026-09-08
**Author review:** pending — team member to sign

---

## 1. The prompts

`blueprint.md` is team-authored. It fixes the stack, the folder structure, the design tokens,
the logo SVG, the component list, the mock data, the copy, and the layout of the seven screens
it defines. The AI wrote implementation code against that specification.

The build was driven by four prompts in one session:

1. > referring to blueprint.md, build a UI mockup for FoC that is runnable and viewable

2. > wait so all the suppliers should just be food places that can be seen in home page then
   > once u click into it it shows the images of individual store, for this mock up we will use
   > deck, so in deck we have images/supplier stores for roasted delights, japanese, yong tau
   > foo & laksa, vegetarian. For the rest dont care

3. > remove com3 kiosk and com3 coffeebean, and wire the rest according to their name, note
   > that some of them the image file is webp some is png some is jpg

4. A settled team decision on the supplier data model (§2 below), plus: *"for the stalls make
   sure to add @deck if they are located at deck etc, and i have added tomoro coffee @ hong
   swee sen memorial library, for the cafe data that u needed, u can scrap away the com3 ones"*

---

## 2. TEAM DECISION — the supplier data model

**Recorded as a settled team decision. Not an AI choice, and not evaluated by the AI.**

> The supplier entity is the STALL, not the canteen. Roasted Delights is a supplier; "The Deck"
> is a venue attribute on it. Standalone stalls with no venue are valid suppliers too. The table
> stays flat — one row per orderable place — and the home-page grouping by venue is a view over
> that flat list, not a parent-child relationship. Order Service is unaffected: supplierId still
> points at exactly one supplier row, it just now means a stall.

### How the mockup implements it

- `src/data/suppliers.js` is a single flat array. Every record is a stall and carries
  `venue: string | null`. The old `stallsBySupplier` map is gone.
- The Deck's four stalls are four supplier records with `venue: 'The Deck'`.
- `groupByVenue()` is a pure view function used by the home page and `/suppliers`. Nothing in
  the data expresses a parent-child link.
- `matchesQuery()` matches stall name, venue, location and category — "Deck" returns all four
  Deck stalls, "laksa" returns the one stall.
- `qualifiedName()` renders "Roasted Delights @ The Deck" everywhere a stall appears outside its
  venue group: the courier board, activity cards, the chat header, and the pick-up selector.
- The "Stall list not added yet" empty state has been deleted. A venue with one stall shows one
  card (UTown Plaza and the library both do).
- `supplierId` on a request still points at exactly one supplier row. Order Service is untouched.

### Deviation from the written instruction, for the team to confirm

Instruction 5 asked for the pick-up selector to read **"Roasted Delights · The Deck"**, but the
same message also asked to *"add @deck if they are located at deck"*. The `@` form was used
everywhere, because it matches the naming convention already in the team's own supplier data
("Flavours @ UTown", "食堂 @ UTown Plaza"). **Change to `·` if the team prefers it.**

---

## 3. OPEN — the team still owes a real answer

These were explicitly not resolved. The mockup uses whatever renders most simply. Each
placeholder is a rendering convenience, **not a recommendation, and not a design decision.**

### a. Should `venue` be its own entity rather than a string?

**Placeholder used:** `venue` is a plain nullable string repeated on each stall record.
`groupByVenue()` groups by string equality, so two stalls are in the same venue only if the
strings match character for character.

**What this dodges:** a venue has no id, no address, no hours, no photo of its own, and a typo
silently splits one venue into two groups. If a venue ever needs its own attributes, this
becomes a real entity and a foreign key.

### b. Do opening hours live on the stall or the venue, and how does the open/closed indicator behave when a venue's stalls disagree?

**Placeholder used:** `hours` and `isOpen` live on the **stall**. A venue heading derives a
summary from its own stalls — `venueOpenSummary()` renders "3 of 4 open now". There is no
venue-level open state anywhere in the data.

**Visible in the mockup:** Vegetarian @ The Deck is deliberately set closed while its three
neighbours are open, so The Deck renders "4 stalls · 3 of 4 open now". That is exactly the case
the question is about — look at it before deciding.

**What this dodges:** whether a venue can be closed while a stall inside it claims to be open,
and which one the courier should believe.

### c. May a request target a venue instead of a stall ("any cai fan, whatever's left"), making `supplierId` nullable?

**Placeholder used:** `supplierId` is always a stall. The pick-up selector on `/requests/new`
offers **only** stalls — there is no "any stall at The Deck" option, and nothing in the UI can
produce a request without a supplier.

**What this dodges:** the request that motivated the question. "Any 2 dishes cai fan, no pork,
whatever's left is fine" (request `r3`) is currently pinned to Frontier as a whole, because
Frontier has not been broken into stalls. Once it is, that request has no correct single stall
to point at. **This one has teeth — it decides whether `supplierId` is nullable in Order
Service.**

---

## 4. Data placeholders that need verifying before D1

Blueprint §12.3 asks the team to verify building attributions. These are the ones at risk:

| Record | Risk |
|---|---|
| `Hong Swee Sen Memorial Library` | Spelling taken verbatim from the team's message. The NUS business library is **Hon Sui Sen** Memorial Library. Likely a typo, but not corrected without the team saying so. |
| `Cool Spot` (University Sports Centre) | **Invented placeholder.** Added only to satisfy "add two or three standalone stalls with venue: null". Verify or replace. |
| `Spinelli Coffee` (Faculty of Law) | **Invented placeholder.** Same. |
| Techno Edge, Frontier, The Terrace, PGPR Canteen | Carried as single rows with `venue: null` because their stall lists have not been collected. They are **not** standalone by nature — they are canteens that have not been decomposed. They render under "On their own" beside the genuinely standalone stalls, which conflates two different things. Decomposing them needs stall names and photos. |

Stall counts, opening hours and `activeRequests` on every record are illustrative.

---

## 5. Browser verification — 393px and 1440px

Run with Playwright/Chromium against the dev server, every route at both widths (16
combinations), driving the login modal to reach the gated screens. The harness lives outside
the repo, in the session scratchpad; nothing was added to `foc-mockup/`.

Checked per route per width: console and page errors, horizontal overflow (measured with
`body { overflow-x }` neutralised, so the CSS could not mask it), tap-target sizes under 44px on
mobile, focus rings under real `Tab` presses, and broken images.

### Result: 16 of 16 pass.

**Bugs this found, now fixed:**

1. **React error on every route.** `useEffect(() => window.scrollTo(0, 0), [pathname])` in
   `App.jsx` and the drawer effect in `TopNav.jsx` used implicit-return arrows, so React treated
   the return value as a cleanup function: *"destroy is not a function"*, thrown on every
   navigation on all 8 routes. Both now use block bodies. This alone failed the blueprint's
   "zero console errors" criterion.
2. **Tap targets below 44px across the app at 393px** (blueprint §8): every `sm` button
   (36px), filter chips and segmented controls (40px), both selects (40px), the logo link
   (32×32 — the wordmark is hidden below 400px per §4, leaving only the mark), card title
   links (19px), the translate link (17px) and the auto-translate switch (40×24). All now meet
   44px on mobile and keep their design heights from `md` up.
3. **Names rendered wrong.** `firstName()` returned the *last* token, so "Gabriel Yap" showed as
   **"Yap"**, "Tng Wen Xi" as **"Xi"** and "Yeo Bing Teck" as **"Teck"** — on the courier board,
   activity cards and the chat composer. Users now carry an explicit `given` field.
4. **Timeline connector overshoot.** On `/activity`, the last lifecycle connector ran past the
   final dot and out of the card, because the last step used `flex-none` while the others were
   `flex-1`. All steps now share a width.
5. **Thumbnail placeholders were unreadable.** At 64px the *Image pending* label overflowed its
   square. Thumbnails now render the icon alone via a `compact` prop.

**Not a bug, but worth knowing for D1:** a full-page screenshot stitches sticky elements down
the page, so the top nav can appear floating mid-capture. The verification harness pins sticky
and fixed elements before capturing. If the team's screenshots show a nav bar in the middle of
the page, that is the capture tool, not the layout.

**Still not verified by machine:** visual taste — spacing rhythm, whether the orange/blue budget
in §3 is respected, and whether photos are cropped acceptably. Screens were reviewed by eye at
both widths and look right, but that judgement is the team's.

---

## 6. Files

Scaffolded by `npm create vite@latest . -- --template react`, then edited: `package.json`
(`dev` → `vite --host`, React pinned to 18), `vite.config.js`, `.gitignore`, `.oxlintrc.json`,
`package-lock.json` (all unmodified from the scaffold), `index.html` (rewritten: fonts, title,
inline SVG favicon), `postcss.config.js`, `tailwind.config.js` (tokens from §3).

Written from scratch:

| File | What it is |
|---|---|
| `src/index.css` | Custom properties, base layer, focus ring, the three animations |
| `src/main.jsx` | Router + `DemoProvider` mount |
| `src/App.jsx` | Route table, nav/footer shell, modal and demo-panel mounts |
| `src/context/DemoContext.jsx` | `isLoggedIn`, `role`, `requests`, login gating, `?clean=1` |
| `src/components/Logo.jsx` | Blueprint §4 SVG, used verbatim |
| `src/components/TopNav.jsx` | Sticky nav, logged-in/out states, mobile drawer |
| `src/components/Footer.jsx` | Wordmark and the credit disclaimer |
| `src/components/Button.jsx` | Four variants, three sizes, 44px mobile floor |
| `src/components/CreditPill.jsx` | The signature element, `sm` / `md` / `lg` |
| `src/components/StatusChip.jsx` | The seven lifecycle statuses |
| `src/components/SupplierImage.jsx` | `onError` placeholder; path-based `image`; `compact` mode |
| `src/components/SupplierCard.jsx` | Stall card, open/closed dot, bookmark, gated action |
| `src/components/RequestCard.jsx` | Courier board row, inline expand, three Accept states |
| `src/components/EmptyState.jsx` | Shared empty state |
| `src/components/LoginModal.jsx` | Gated-action modal; submitting flips the demo auth state |
| `src/components/DemoControls.jsx` | Auth / role / status controls; hidden by `?clean=1` |
| `src/data/suppliers.js` | The flat stall list, venue grouping and search helpers |
| `src/data/users.js` | The five team members, with explicit given names |
| `src/data/locations.js` | Ten destinations, two bookmarked |
| `src/data/requests.js` | Twelve requests spanning every status, plus display helpers |
| `src/data/messages.js` | Three threads; two Chinese and one Malay message with translations |
| `src/data/transactions.js` | Wallet history — see §7.3 |
| `src/pages/Landing.jsx` | Hero, segmented search bar, filter chips, venue-grouped grid |
| `src/pages/Suppliers.jsx` | Search, filter rail / bottom sheet, sort, venue-grouped results |
| `src/pages/SupplierDetail.jsx` | Stall detail and its venue siblings — team-directed addition |
| `src/pages/CreateRequest.jsx` | Six fields in order, credit stepper, insufficient-credit state |
| `src/pages/RequestBoard.jsx` | Stacked job board, live-update affordance, empty state |
| `src/pages/Activity.jsx` | Two tabs, lifecycle timeline, role-dependent actions |
| `src/pages/Chat.jsx` | Thread list, bubbles, per-message translate, auto-translate switch |
| `src/pages/Wallet.jsx` | Balance, available/reserved bar, expandable history |
| `README.md`, `AI-NOTES.md` | Documentation |

Every file above carries the blueprint §0 attribution header, except `package.json`,
`package-lock.json`, `.gitignore` and `.oxlintrc.json`, where a comment block is not valid
syntax or would be rewritten by npm.

---

## 6b. TEAM-DIRECTED CHANGE — My activity

Requested after the first browser pass:

> for the my activity page, there should be a CLEAR distinction between requesting and running
> errand, maybe colour code the outline of the card? so my activity should only show 1
> errand/deliveries that is active the rest should show completed with no option to message
> them anymore, and also for my deliveries there should also be a message button

### What was done

- **Role is colour-coded and labelled.** Each card carries a 3px left edge — **blue** when you
  requested it, **orange** when you are delivering it — plus a neutral chip reading
  *You requested* / *You are delivering* with a bag or bike icon. The chip is deliberately
  grey rather than coloured so it cannot be mistaken for a `StatusChip`.
- **Each tab is split into `Active now` and `History`.** Active is `open / accepted /
  picked_up / delivered`; History is `completed / cancelled / expired`.
- **Exactly one live item per tab.** Requests `r4`, `r7` and `r8` moved to `completed`, leaving
  `r6` (accepted) as the only live errand and `r12` (picked up) as the only live delivery.
- **History cards carry no actions at all** — no message button, nothing to click.
- **Couriers can message.** `Message <requester>` is now a secondary action beside
  `Mark picked up`, `Mark delivered`, and the `delivered` waiting state.

### Blueprint deviations this creates — flagged, not resolved

1. **§7.5's action table gives the courier no message action.** It lists only `Mark picked up`
   and `Mark delivered`. A message button on the courier side contradicts that table. It is
   still "exactly one primary action per card" — messaging is secondary — but the table itself
   needs updating to match. **The team asked for this; it is recorded as their decision.**

2. **Two states are no longer visible in a default screenshot.** Both are still reachable
   through the demo panel's status jump, but they no longer appear on load:

   - **`delivered`** exists nowhere in the seed data now, so the black `delivered` StatusChip
     and the requester's *Confirm and release credits* card (§7.5) need the demo panel.
   - **The courier board's *Your errand* state (F3.2.1)** needed a `u1`-owned **open** request.
     `r4` was that request and is now completed, so the board shows no own-request row by
     default.

   Fixing either means more than one active item per tab, which is what the change asked to
   remove. **If those two screenshots matter more than the one-active rule, say so and `r4`
   goes back to `open` and `r8` back to `delivered`.**

3. **§3's colour discipline.** A 3px coloured card edge is new — the blueprint says cards get
   `1px solid var(--line)` and that colour "marks state". Here it marks *role*, which is a
   slight widening of that rule. It is a few pixels per card and well inside the 5% budget.
   The role chip alone would carry the meaning if the team would rather drop the colour.

---

## 6c. TEAM-DIRECTED CHANGE — three minor edits

> 1) remove the search part from the home page, the from any stall deliver to ... and by when.
> Then add a search button with word u find suitable beside the open now that lead u to the
> supplier page
> 2) delete the 3-5 token recommendation for the requester form, as we didnt mention it in our
> project log so this is to be safe
> 3) add a simple search bar in find errand page to search for places, and also 1 small tweak
> to the open and accepted tag make sure they are aligned so that it is easier to see at a
> glance

### 1. Landing hero search removed

The segmented From / Deliver to / By when bar is gone, along with its mobile full-screen sheet.
A `Search stalls` pill now sits after `Open now` in the filter row and navigates to
`/suppliers`. It is outlined in `ink` rather than `line` so it does not read as a fourth filter
toggle.

**Blueprint conflict:** §7.1 states *"The search bar is the hero. It is a single rounded
container with internal dividers, each segment showing a small label above a value — the Airbnb
pattern."* That element no longer exists, and §7.1's mobile behaviour (*"collapses to a single
full-width pill … which opens a full-screen sheet with the three fields stacked"*) went with it.
The landing page is now hero copy, filter chips, and the venue-grouped grid. **Recorded as the
team's decision.**

Nothing was lost functionally: the bar's three fields were decorative (they filtered nothing),
and its button already went to `/suppliers`, which is where the real search and filters live.

### 2. Credit recommendation removed

The line *"Most errands to this location are picked up at 3–5 credits."* is deleted from
`/requests/new`. **Blueprint conflict:** §7.3 field 5 specifies it verbatim. The team's reason —
it implies pricing guidance the backlog never committed to — is recorded as theirs. The
insufficient-credit error (Credit F1.2.2) and the *"After posting, you'll have 10 of 14 credits
available"* line are untouched.

### 3. Courier board search, and status-chip alignment

- A search input sits above the filter chips on `/requests`. It matches **either end of the
  errand**: the stall it is collected from (name, venue, location, category, via the shared
  `matchesQuery`) or the drop-off point. "Deck" and "COM1" both return two rows. The empty
  state changes wording when a search is what produced no results. **§7.4 does not specify a
  search on this screen — this is an addition.**
- **Status chips moved onto the top-left corner of the thumbnail.** They no longer flow after
  the stall name, so every chip sits at the same x *and* the same y and the board reads straight
  down its left edge. `StatusChip` gained an `sm` size (h-5, 11px) so the widest label still
  fits inside the thumbnail, and the mobile thumbnail went from 64px to 80px to hold it —
  a small deviation from §7.4's *"thumbnail shrinks to 64px"*. All chip fills are opaque, so
  they stay legible over a photo. Measured aligned to the pixel on both axes, with no overflow
  past the image, at 393px and 1440px.
- Along the way the desktop action column was given a fixed width: sized by content, an
  `Accept` row and a `Taken` row ended at different x positions, which had been nudging the
  right-hand column out of line.

---

## 6d. TEAM-DIRECTED CHANGE — three separate clocks per errand

> request expiration time is for open request to expire and complete-by time is for time for
> food to be delivered … provide an option to indicate that … both time should be shown in the
> find errand page, and also track activity should show the complete by time as well

### The distinction, as implemented

| Field | Meaning | Applies while |
|---|---|---|
| `postAt` | When the request is **sent out to the board**. `null` = it went out immediately. A future value means it is scheduled and not yet listed. | before it posts |
| `expiresAt` | When an **unaccepted** request stops being offered and the reserved credits come back. Counts from the moment it posts. | `open` only |
| `completeBy` | The deadline for the **food to arrive**. `null` = as soon as possible. A reference for the courier, never a lifecycle state. | the whole errand |

### Where each one appears

- **`/requests/new`** — three consecutive fields, each with a one-line explanation so they
  cannot be confused:
  - **4. *"When should this go out?"*** — marked `Optional`. `Send it out now` /
    `Schedule for later`, revealing date and time. Sets `postAt`. The primary button changes to
    `Schedule errand`, and the footer adds `· scheduled to go out …`.
  - **5. *"When do you need it by?"*** — `As soon as possible` / `By a specific time`. Sets
    `completeBy`.
  - **6. *"How long should this stay open?"*** — 15 / 30 / 45 / 60 / 120 minutes. Sets
    `expiresAt`. Its helper reads *"of it going out"* when scheduled and *"of posting"*
    otherwise, and the contradiction warning now measures from the scheduled send-out time
    rather than from now.

  Date inputs default to today's date, computed at render — not a hardcoded string that goes
  stale overnight.
- **`/requests`** — the drop-off line reads `→ COM1 Basement · deliver by 19:09`, with
  `Offer expires in 42 min` beneath it. The expiry line is rendered **only for `open`
  requests**, since it stops meaning anything once a courier accepts. The expanded row shows
  both as full timestamps.
- **`/activity`** — live cards carry a `Deliver by 19:09` line. History cards omit it.

### Blueprint deviation

§7.3 says *"Fields, in this order and no others"* and lists six. There are now eight: the
expiry control and the send-out control are both new. Order F1.1.1 did list "expiration" as a
required field, so the form was arguably incomplete before. The split into three clocks is the
team's decision, recorded here as theirs.

The scheduled-errand nice-to-have, noted as dropped in an earlier revision, is back — but as a
**send-out** time rather than the old "schedule for later" pick-up. All three clocks now exist
independently.

### Gaps raised, and the team's answers

All six were put to the team and answered. **No code changed as a result — every answer
confirmed the behaviour already built.** Recorded so the reasoning survives into D2.

| # | Raised | Team's answer | Status in the mockup |
|---|---|---|---|
| 1 | No overdue state for a passed `completeBy` | *"complete by is just a reference, its not a state"* | Correct as built. The deadline is displayed and never enforced; no chip, no status, no notification. |
| 2 | No consequence for missing the deadline | Same answer — reference only | No penalty, no partial credit, no rating effect anywhere. |
| 3 | Is `completeBy` nullable? | *"yes it can be"* | `null` means "as soon as possible" and renders as `deliver ASAP`. |
| 4 | What happens to `expiresAt` after acceptance? | *"can ignore after accept"* | The `Offer expires in …` line renders only while the status is `open`. |
| 5 | The two clocks can contradict each other | *"doesnt matter this is a mockup"* | Warning shown in `alert`; posting is **not** blocked. |
| 6 | Scheduled errands absorbed into the deadline | *"doesnt matter"* | No third time on the record. The nice-to-have is dropped. |

### Open on the send-out clock specifically

The team answered the six questions on the first two clocks. Adding `postAt` raises three more,
none of them answered:

1. **A scheduled errand has no status and appears nowhere.** Between scheduling and posting it
   is not on the board and not in `My activity`. Nothing in the lifecycle
   (`open → accepted → …`) covers "written but not yet sent". If the requester should be able
   to see, edit or cancel it in that window, it needs a state.
2. **When are the credits reserved — at schedule time or at post time?** The footer says
   reserved until completed or cancelled, which is unambiguous for an immediate post and
   ambiguous for a scheduled one. It also decides whether scheduling an errand you cannot
   currently afford is allowed.
3. **Can a scheduled errand be edited or cancelled before it goes out?** F5 covers cancellation
   and F6 editing for posted requests; neither mentions this window.

All three are only relevant if the team wants scheduling to be real rather than a form control
for the D1 screenshot. In the mockup every seeded request has `postAt: null`, so nothing is
currently in that state.

**Consequence worth knowing at the presentation:** a grader may ask why an errand carries a
delivery deadline that nothing enforces. The answer is item 1 — for D1 the complete-by is a
reference the courier reads before accepting, deliberately not a lifecycle state. If Order
Service later needs to act on it, items 1 and 2 are where that work starts.

---

## 6e. TEAM-DIRECTED CHANGE — floating chat bubble and a system message

> add a chat bubble on the bottom left of the screen always and that lead u to the chat page,
> in the chat page can u include one more chat from the system that say welcome you are awarded
> with 20 credits

### The bubble

`src/components/ChatBubble.jsx` — a 56px black circle fixed at `bottom-4 right-4`, mounted in
`App.jsx` so it rides every route. It carries an orange unread count derived from the thread
data, and links to `/chat` (which redirects to the most recent conversation).

It is hidden in two cases: **when logged out**, since a visitor has no conversations to reach
and every chat route is gated anyway; and on `/chat` routes, where it would point at the page
you are already on.

**No collision with the demo panel.** An earlier revision put the bubble at bottom-left and
pushed `DemoControls` up to `bottom-24` to make room. With the bubble on the right, the demo
chip is back at `bottom-4 left-4` exactly as blueprint §5 specifies.

**Blueprint deviation:** §5 lists the shared components and `ChatBubble` is not among them.
§12.4 says to ask before adding a component — the team asked for this one, so it is recorded as
their decision.

### The system message

`messages.js` gains a fourth thread, pinned first in the list:

> Welcome to FoC. You've been awarded 20 credits to get you started. Post an errand to spend
> them, or run one for someone else to earn more.

It is addressed as `/chat/system`. This is the first thread with **no errand attached**
(`requestId: null`) and no user record behind it, which the chat screen previously assumed
could not happen. Handling added:

- Threads are now found by errand id **or** thread id (`findThread`), and linked via
  `threadHref`.
- `SYSTEM_USER` stands in for a sender with no user record.
- The header shows `Account updates` instead of an errand line, and drops the call buttons.
- System messages render as a centred notice rather than a left-aligned person's bubble.
- The auto-translate row is removed, and the composer, attach and send controls are disabled —
  you cannot reply to FoC.

One bug caught in review: the translate row was first hidden with the `hidden` attribute, which
Tailwind's `display:flex` silently overrides. It is now conditionally rendered.

### Open

- **Nothing generates system messages.** The welcome note is seeded data. Whether the credit
  award, expiry, cancellation or delivery events should also produce system messages is not in
  the backlog, and the mockup does not imply an answer.
- **The unread counts are static.** Opening a thread does not clear its badge, so the bubble
  always reads 3.

---

## 7. Other deviations from the blueprint

1. **An eighth screen, `/suppliers/:id`.** Added on the team's instruction (prompt 2), then
   reframed as a stall detail page by the model decision. Two blueprint conflicts were raised
   before it was built and both were accepted: §7 says "Do not add screens", and §0 lists "No
   supplier menus, product catalogs, inventory, or checkout" as a hard scope boundary. To stay
   on the defensible side of that boundary the page lists no items and no prices; the only
   action is the same free-text `Request from here`.

2. **Two suppliers removed** (prompt 3): COM3 Food Kiosk and The Coffee Bean @ COM3. Knock-ons:
   the `Café` category briefly emptied, so `categories` is now derived from the data rather than
   hardcoded — it refilled when Tomoro Coffee arrived. The landing heading "Canteens and cafés
   on campus" (§7.1) became inaccurate and now reads "Places to fetch from on campus";
   **revert if the team prefers the original.** Two requests pointing at the deleted rows were
   reassigned. No School of Computing supplier remains.

3. **`src/data/transactions.js` is not in the blueprint's file list (§2).** The wallet screen
   needs transaction history for Credit F1.5.2 and F2.1.1 and no data file was named. A
   file-placement choice, not a schema decision. **Confirm or relocate.**

4. **Image filenames follow the files the team supplied**, which mix `.webp`, `.png` and `.jpg`.
   `image` is a path under `/images/`, so one field covers both folders. `SupplierImage`
   URL-encodes each path segment because `roasted delight.webp` contains a space.

5. **React 18 pinned deliberately.** `npm create vite` scaffolds React 19; the blueprint says
   React 18.

6. **Small helpers were appended to blueprint-listed files** rather than creating modules §2
   does not list: time formatting and the lifecycle label map in `requests.js`, grouping and
   search helpers in `suppliers.js`.

7. **`AGENTS.md` at the repo root is empty**, so there were no conventions to conflict with.

8. **The expired-confirmation gap (§12.2) is still open and unresolved.** The lifecycle ends
   `delivered → completed` on requester confirmation. Nothing specifies what happens if the
   requester never confirms, so credits stay reserved indefinitely. The `delivered` state on
   `/activity` is built with no auto-confirm affordance, exactly as §7.5 instructs.

---

## 2026-09-30 — Supplier fields aligned to the API contract; admin supplier CRUD mockup

**Tool:** Claude Code (model: claude-sonnet-5-5)
**Mode:** generate | refactor
**Scope:** Implementation code (UI mockup only; no backend calls)
**Governing decision:** Field-by-field resolution given by the team in chat on 2026-09-30 (below);
API shapes from `supplier-service/SupplierServiceArchitecture.md` §6.2, §7.2, §7.3, §8.2.

**Prompts (exact):**
> For now, can i configure the frontend to use the supplier service for all supplier-related content?

> For auth, refer to @instructions.md . essentially the tokens are hashed and stored in the postgres db
> For the UI, i want to revamp the fields such that it uses the fields as supplied by the API contracts
> Here are the mockup-vs-api resolution:
> id on fe will be number
> venue on fe will be renamed and mapped to location
> shortName on fe will be removed
> location on fe is renamed and mapped to faculty
> category on fe will be replaced with categories, and the fe will support display of multiple categories in pills
> description on fe is renamed to desc, and list view will not display the disc
> activeRequests deferred - non supplier-service related
> images will be hosted on cloud, so the image on fe will be renamed to photoLocation and store that signed url link
> AFter these are resolved, I would like to first mock up the new supplier crud pages in admin

**Key responses:**
- Declined to choose the frontend/gateway/auth wiring, asked the team; the first prompt was not
  implemented as real API wiring. Only the mock data shape and screens were changed in this task.
- Reshaped `src/data/suppliers.js` to the API response shape per the team's mapping; requests now
  reference suppliers by numeric id. List/detail/card/landing/request screens read the new fields.
  The list shows no `desc`, `hours` or `activeRequests`; sort is A-Z / Z-A only (§7.2).
- Added admin mockup screens (static, in-memory `AdminSuppliersContext`): list, create, edit, soft
  delete, reactivation of a matching soft-deleted supplier, name/type/location uniqueness (422),
  Facility/Store and 24-hour hours handling, 0–10 JPEG/PNG photos ≤ 5 MB with reordering.
  Demo controls gained an Admin role. Nothing calls the Supplier Service.
- Verified: `vite build` passes; `oxlint` shows only fast-refresh/unused-var warnings (existing ones
  plus the same fast-refresh kind in the new context file). Create, validation, duplicate, edit and
  delete were exercised in the browser via scripted interaction. Not verified: visual layout (the
  screenshot tool timed out), mobile widths, real photo upload rendering.

**Files:**
- `src/data/suppliers.js` (modified: rewritten to the contract shape)
- `src/data/requests.js` (modified: numeric `supplierId`)
- `src/components/SupplierCard.jsx`, `SupplierImage.jsx`, `RequestCard.jsx`, `TopNav.jsx`, `DemoControls.jsx` (modified)
- `src/components/CategoryPills.jsx` (created)
- `src/pages/Suppliers.jsx`, `SupplierDetail.jsx`, `Landing.jsx`, `CreateRequest.jsx` (modified)
- `src/pages/AdminSuppliers.jsx`, `AdminSupplierForm.jsx` (created)
- `src/context/AdminSuppliersContext.jsx` (created)
- `src/App.jsx`, `src/main.jsx` (modified: routes, provider)

**Deviations / questions raised for the team:**
- Placeholder mock values, not team data: `type` ('Store' everywhere), `level` (1), identical hours Mon–Sun,
  and `location` for the six suppliers that had no venue (old location text reused, because the API requires one).
- `hours` was not in the team's resolution list; the list view now shows only open/closed and the
  detail page shows per-day `openingHours`, as the API returns them.
- `activeRequests` removed from the supplier UI (and the "Most errands" sort) rather than kept mocked.
- The edit form must map `location`/`categories` names back to ids through the reference endpoints,
  because the detail response carries names, not ids. The team may want to confirm this.
- Token storage on the frontend (in memory vs elsewhere) is not recorded in `instructions.md`
  (it records the hashed refresh token in the DB and an httpOnly refresh cookie); real login wiring
  was not started.
- Public supplier pages do not reflect admin changes (separate in-memory stores).

**What I kept/changed/rejected: Kept all**

**Author review: Congchen**

---

## 2026-09-30 — Supplier ids in the mock data; admin edit form uses them

**Tool:** Claude Code (model: claude-sonnet-5-5)
**Mode:** refactor
**Scope:** Implementation code (UI mockup only)
**Governing decision:** Team decision in chat, 2026-09-30, recorded in `supplier-service/SupplierServiceArchitecture.md` §7.3 and §9 item 23.

**Prompts (exact):**
> 2. Update the API responses so that the name and ids are sent together. new location_id and faculty_id. for categories, since there can be multiple categories for a given supplier, the categories will be sent as a list of json, with the structure being  "categories": [{"category": "Food", "category_id": 1 }, {"category": "Drinks", "category_id":2}] for example

**Key responses:**
- Mock supplier objects now carry `location_id`, `faculty_id` and `categories` as `{category, category_id}` objects, matching the updated service responses. `CategoryPills`, both supplier lists, the landing chips and the admin list/store read the new shape.
- The admin edit form pre-fills `locationId` and the category selection directly from those ids; the earlier name-to-id lookup against the reference lists is removed. The duplicate check in the mock store compares `location_id`.
- Verified: `vite build` passes; in the browser the edit form for "Japanese" showed location "The Deck · Faculty of Arts & Social Sciences" and category "Canteen" selected. Other screens were not re-checked visually.

**Files:**
- `src/data/suppliers.js`, `src/components/CategoryPills.jsx`, `src/pages/Landing.jsx`, `src/pages/Suppliers.jsx`, `src/pages/AdminSuppliers.jsx`, `src/pages/AdminSupplierForm.jsx`, `src/context/AdminSuppliersContext.jsx` (modified)
- `AI-NOTES.md` (modified)

**Deviations / questions raised for the team:** None

**What I kept/changed/rejected: Kept all**

**Author review: Congchen**
