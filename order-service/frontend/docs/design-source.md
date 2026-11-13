# Order frontend design sources

Figma: [flat siuu (Copy)](https://www.figma.com/design/LVJfwfN3VxUoDXzjXd6IgD/flat-siuu--Copy-?node-id=0-1&t=Gzn5jlI6XasO7y5t-1).
The frames were shared as screenshots, so node IDs are not recorded yet.

| Frame | Route | Notes |
| --- | --- | --- |
| Browse errands ("Run an errand") | `/errands/browse` | Open pool with filters and sort |
| Errand details | `/errands/:orderId` (viewer is not a participant) | Accept with confirmation |
| Courier active order ("You're the courier") | `/errands/:orderId` (viewer is the courier) | Pick up, deliver, withdraw |
| Requester active order ("Have you received…") | `/errands/:orderId` (viewer is the requester) | Confirm receipt, cancel |
| My errands | `/errands/mine` | F9: Requester history rows; Courier Active and Past cards |
| Create errand ("Create a campus errand") | `/errands/new` | Full-width request form with an inline credit check |
| Edit errand (no frame; reuses the Request a hand form) | `/errands/:orderId/edit` | Requester edits an OPEN errand (T4/T5) |

## Visual language

The shared [product design contract](../../../design.md) defines the shell, colours, type, shape,
component states and accessibility checks; it is not repeated here. Order-specific choices on top:

- Loading errands show placeholders in the shape of the list or errand detail, labelled for screen
  readers; they do not animate under reduced motion.
- Empty, error and not-found screens use one icon panel with the next useful action: Request help
  or Find errands on an empty Active list, Clear filters when filters hide every open errand, and
  Try again when an errand fails to load.
- Routes and links use Lucide icons (pickup and drop-off pins, arrows) instead of text symbols.
- Browse and Courier history use the responsive discovery card. Requester history uses the same
  API-backed card content in compact rows, keeping reward, state, route, deadline, detail and repost
  actions. The latest supplied image areas are adapted to a category-neutral Lucide location
  surface because Order does not own an image or category field; the UI never assigns a made-up
  photo or category to an errand. Cards use one neutral outline rather than a coloured edge accent.
- Create errand follows the supplied full-width form panel. The real location pickers, numeric
  reward, credit availability, retry and reservation states remain in the panel; the reference's
  category field is omitted because Order has no category contract.

## Adaptations to the API

The backend contract wins over example data in Figma:

- **No "Deliver by" time.** Orders only have a pickup deadline, so "Deliver by" is not shown.
- **No "Maximum distance" filter or "Closest pickup location" sort.** The API has no distance; the
  filters are minimum/maximum reward and the sorts are nearest deadline, highest reward and pickup
  location name.
- **"Errand FOC-1042"** is shown as a short reference derived from the order UUID.
- **"Requested by Mei Lin" / "Alex marked…"** need usernames, which Order Service does not store
  (it only has user IDs), so the UI says "the requester" / "your courier".
- **Chat, Notifications and "Report an issue"** have no backend yet and are not shown.
- **Locations are picked from a searchable list, not typed freely.** The form loads active
  locations from Supplier's public `GET /api/suppliers` in the browser and sends both the ID and
  name; Order Service still never calls Supplier. The picker (`LocationCombobox`) filters as you
  type by name, building or level and starts with "Choose a location"; only a listed location can be
  chosen.
- **No "Deliver by" field.** Orders have only a pickup deadline. A **reward** field is added: the
  design shows "Reserve for this errand: 3 credits" but has no input for it.
- **"Your credits"** reads the caller's own balance from Credit's `GET /api/credits/me` in the
  browser (Order Service never calls Credit). **Post errand is disabled** unless that balance is
  confirmed and covers the reward: while it loads, when Credit is unavailable, when the user has no
  credit account yet, or when the reward is higher than the available credits.
- **A refused reservation names its reason** on the errand page and its status badge, from
  `terminalReason`: "Not enough credits", "Credit account not set up" (with a link to set it up) or
  "Credits couldn't be reserved" ("Not posted" badge) for any other reason.
- **Editing an errand** is offered only to its requester, in a Requester session, while it is OPEN
  with no reward change pending. Saving sends the whole form with the `version` that was read.
  Detail changes apply at once. A new reward waits for Credit like posting does: raising it needs
  the difference to be available (checked in the browser first), lowering it is always allowed;
  if Credit refuses, the form stays and says the old reward stands. An errand accepted, expired or
  edited elsewhere meanwhile is explained, with a reload, instead of being overwritten.
- **Posting waits for the reservation.** After Post errand the form locks ("Reserving your
  credits…") and the page reads the new errand every second. It opens the errand once Credit
  reserves the reward. If Credit rejects it (for example two errands posted at once), the form
  stays filled in and explains why from the errand's `terminalReason`: not enough credits, no
  credit account (with a link to set it up), or a generic retry message; a deadline that passes
  while waiting is explained too. After 30 seconds without an answer the form unlocks and links to
  the errand, which opens on its own once Credit answers.
- **Post again** copies one of the requester's own ended errands (completed, cancelled, expired or
  not posted) into Request help through `/errands/new?from=<id>`, offered on My errands → Past and on
  the errand page in a Requester session. Title, locations, reward and description are filled in;
  Pick up by is left empty and focused. A location Supplier no longer lists is cleared with a note
  naming it. Only empty fields are filled, and only from the caller's own errand; anything else
  opens an empty form saying it couldn't be copied. Posting creates a new errand through the usual
  credit check and reservation wait; the original is unchanged.
- **Requester/Courier navigation** follows the session role switch in the header, because the API
  authorises actions by the session role. Requester My errands uses a prominent **Create new
  errand** action while the create panel provides **Cancel** back to history. A Courier sees
  **Open requests · Past errands** as one contained segmented control with a filled current state.
  The Courier tabs keep the existing `/errands/browse` and `/errands/mine` routes and omit reference
  counts because each route loads its own authoritative paginated result.
  Opening the other role's screen, or switching role while on one, goes to the current role's own
  landing (`/errands/mine` for Requester, `/errands/browse` for Courier). The Requester opens the
  create form explicitly from **Create new errand**.
- **An errand page follows the header role too.** Requester mode shows only the user's own errands;
  Courier mode shows errands they run or could accept. Opening any other errand in that role, or
  switching role while on one, goes to the current role's own screen. Admin sessions are unchanged.
