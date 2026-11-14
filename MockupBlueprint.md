# FoC — UI Mockup Blueprint

**For:** Claude Code
**Project:** CS3219 AY2627S1, ProjectGroup 18 — FoC (peer-to-peer campus errand platform)
**Milestone:** D1 — responsive UI prototype for the Week 5 presentation
**Deliverable:** 7 screens, desktop + mobile, screenshotted into the D1 template

---

## 0. Read this first

### What you are building

A **static, non-functional UI mockup**. No backend, no API calls, no database, no auth. Every
piece of data is hardcoded in `src/data/`. Buttons navigate and toggle local state; nothing
persists. The only purpose of this app is to produce screenshots.

### What you must NOT do

This is a graded academic project with an AI usage policy. You are permitted to write
implementation code. You are **not** permitted to make architecture or design decisions on the
team's behalf.

- Do not propose or alter the microservice boundaries, data schemas, or service interfaces.
- Do not add, remove, or reinterpret requirements. Every screen below traces to a numbered
  requirement in the team's backlog. If you think something is missing, **say so and stop** —
  do not fill the gap yourself.
- Do not invent features that are not specified here.

If any instruction below is ambiguous, **ask the user rather than choosing**. There is a list
of known open questions in §12.

### Mandatory AI attribution

Every file you create must begin with this comment block, filled in:

```
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: <model you are running as>), date: <YYYY-MM-DD>
 * Scope: Generated UI mockup component <name> from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
 */
```

When you finish, also write `foc-mockup/AI-NOTES.md` listing every file you created and the
prompt that produced it, so the team can paste it into `/ai/usage-log.md`.

### Hard scope boundaries from the project brief

These are out of scope and must not appear anywhere in the UI:

- **No supplier menus, product catalogs, inventory, or checkout.** A request is free text.
  Do not build a "browse the menu and add to cart" flow.
- **No money.** Credits only. Never render a `$`, never show a payment method.
- **No live courier tracking.** No moving map, no ETA countdown, no "courier is 200m away".
- **No admin screens** in this set of 7.

---

## 1. Location and stack

The repo root already looks like this:

```
FoC-Template/
├── credit-service/
├── order-service/
├── supplier-service/
├── user-service/
├── .env.example
├── AGENTS.md
├── compose.yaml
├── LICENSE
└── README.md
```

Create **one new folder at the root**, sibling to the services. Everything — code, images,
mock data — lives inside it. Touch nothing outside it.

```
FoC-Template/
└── foc-mockup/          ← everything you create goes here
```

**Stack:** Vite + React 18 + JavaScript (not TypeScript — this is throwaway UI) +
Tailwind CSS + react-router-dom. No component library, no state manager, no UI kit.
`lucide-react` for icons is the only other dependency.

```bash
cd foc-mockup
npm create vite@latest . -- --template react
npm install react-router-dom lucide-react
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Add to `package.json` scripts so the team can view it on a phone over LAN:

```json
"dev": "vite --host"
```

---

## 2. Folder structure

```
foc-mockup/
├── public/
│   └── images/
│       └── suppliers/          ← team drops photos here (see §10)
├── src/
│   ├── components/
│   │   ├── Logo.jsx
│   │   ├── TopNav.jsx
│   │   ├── Footer.jsx
│   │   ├── SupplierCard.jsx
│   │   ├── SupplierImage.jsx
│   │   ├── RequestCard.jsx
│   │   ├── CreditPill.jsx
│   │   ├── StatusChip.jsx
│   │   ├── Button.jsx
│   │   ├── EmptyState.jsx
│   │   ├── LoginModal.jsx
│   │   └── DemoControls.jsx
│   ├── data/
│   │   ├── suppliers.js
│   │   ├── requests.js
│   │   ├── users.js
│   │   ├── locations.js
│   │   └── messages.js
│   ├── context/
│   │   └── DemoContext.jsx
│   ├── pages/
│   │   ├── Landing.jsx
│   │   ├── Suppliers.jsx
│   │   ├── CreateRequest.jsx
│   │   ├── RequestBoard.jsx
│   │   ├── Activity.jsx
│   │   ├── Chat.jsx
│   │   └── Wallet.jsx
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── AI-NOTES.md
├── README.md
└── package.json
```

---

## 3. Design system

The brief: modern marketplace UI in the spirit of Airbnb/Trivago, **mostly black and white**,
with NUS orange and blue used sparingly.

### Colour tokens

Define in `index.css` as CSS custom properties and mirror into `tailwind.config.js`.

| Token | Hex | Use |
|---|---|---|
| `ink` | `#000000` | Headings, wordmark, primary buttons |
| `ink-70` | `#4A4A4A` | Body text |
| `ink-40` | `#8A8A8A` | Meta text, timestamps, placeholder |
| `line` | `#E4E4E4` | Borders, dividers |
| `surface` | `#FFFFFF` | Page background, cards |
| `surface-alt` | `#F7F7F7` | Section bands, input fills, chat bubbles |
| `orange` | `#EF7C00` | NUS Orange. Accent only |
| `blue` | `#003D7C` | NUS Blue. Links, focus rings, "open" state |
| `alert` | `#B3261E` | Destructive/expired only |

**Discipline rule:** on any given screen, orange and blue together must occupy less than
roughly 5% of the pixels. They mark state and draw the eye to one action. They are never
backgrounds, never gradients, never decorative fills behind text. If a screen looks colourful,
you have over-used them.

### Typography

Two families, loaded from Google Fonts in `index.html`:

- **Bricolage Grotesque** — wordmark, page H1, hero. Weights 600, 700. Letter-spacing `-0.03em`
  at display sizes. Used *only* for the logo, the hero headline, and page titles. Nowhere else.
- **Figtree** — everything else. Weights 400, 500, 600.

Scale (rem): `0.75 / 0.875 / 1 / 1.125 / 1.375 / 1.75 / 2.25 / 3`. Body copy `1rem`,
line-height `1.55`, max line length 68 characters.

All credit values, prices, and counts get `font-variant-numeric: tabular-nums` so digits don't
jitter when state changes. Do not use a monospace typeface for this.

**Do not** use all-caps labels, do not put an eyebrow label above every section heading, do not
append `→` to button text, and do not colour a single word in a headline.

### Shape and depth

- Radius: `12px` cards, `10px` buttons and inputs, `999px` chips and pills.
- Borders over shadows. Cards get `1px solid var(--line)`, no drop shadow.
- Exactly two places get a shadow: the sticky top nav on scroll, and open modals.
- Focus ring: `2px solid var(--blue)` with `2px` offset. Must be visible on every interactive
  element — this is part of the responsive/accessibility story the team is being graded on.

### Motion

One orchestrated moment only: on the landing page, the hero headline and search bar fade up
together on load (250ms, `ease-out`, respecting `prefers-reduced-motion`). Everything else is
either instant or a 150ms state transition that answers a click (modal open, chip toggle,
translate swap). No scroll-triggered reveals. No hover lift on cards.

### The signature element

Spend the boldness in one place: **the credit pill**. It appears on every request card, in the
nav, and at large size on the wallet. Everything else stays quiet.

```jsx
// CreditPill.jsx — sizes: sm (cards), md (nav), lg (wallet hero)
// Black filled capsule, white tabular number, lowercase "cr" in ink-40 on white variants.
// sm:  h-6  px-2.5  text-[13px]
// md:  h-8  px-3    text-[15px]
// lg:  h-14 px-5    text-[28px]
```

---

## 4. The logo

Name is **FoC**. Mark is a black rounded square containing a white path running from a white
origin dot to a filled orange destination dot — the errand, A to B. Wordmark set in Bricolage
Grotesque 700.

`Logo.jsx` renders exactly this SVG (do not redesign it):

```jsx
<svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
  <rect width="32" height="32" rx="10" fill="#000000" />
  <path d="M9.5 22.5C9.5 15.5 14.5 11.5 21.5 11.5"
        stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" />
  <circle cx="9.5" cy="22.5" r="2.4" fill="#FFFFFF" />
  <circle cx="21.5" cy="11.5" r="3.6" fill="#EF7C00" />
</svg>
```

Beside it, `FoC` at `1.375rem`, weight 700, `-0.03em` tracking, colour `ink`. On screens
narrower than 400px, render the mark alone without the wordmark.

Props: `size` (`sm` 24px / `md` 32px), `showWordmark` (default true).

---

## 5. Shared components

### `TopNav.jsx`

Sticky, `64px` tall, white, `1px` bottom border that appears only once scrolled.

- **Left:** `<Logo />`, links to `/`.
- **Centre (desktop ≥1024px only):** text links — Suppliers, Find errands, My activity.
- **Right, logged out:** a single black `Log in` button.
- **Right, logged in:** `<CreditPill size="md" />` showing available credits, a bell icon, then
  the user's first name and a 32px circular avatar with their initials on `surface-alt`.
- **Mobile (<768px):** logo left, hamburger right. Drawer slides in from the right containing
  the same links stacked, the credit pill at top, and the log in / profile block.

### `SupplierImage.jsx`

Wraps `<img>`. On `onError`, swaps to a `surface-alt` block with a centred `ImageOff` icon and
the supplier name in `ink-40`, plus small text: *Image pending*. Never let a broken image icon
render. This is what makes the app presentable before the team adds photos.

### `StatusChip.jsx`

Pill, `h-6`, `text-[12px]`, weight 500. Maps the request lifecycle:

| Status | Style |
|---|---|
| `open` | white fill, `1px` blue border, blue text |
| `accepted` | orange fill, white text |
| `picked_up` | white fill, `1px` orange border, orange text |
| `delivered` | black fill, white text |
| `completed` | white fill, `1px` line border, `ink-40` text, small check icon |
| `cancelled` | `surface-alt` fill, `ink-40` text |
| `expired` | `surface-alt` fill, `ink-40` text |

### `Button.jsx`

Variants: `primary` (black fill, white text), `secondary` (white fill, `1px` line border),
`ghost` (text only), `danger` (white fill, alert border and text). Sizes `sm`/`md`/`lg`.
All `10px` radius. Disabled state: `surface-alt` fill, `ink-40` text, `cursor-not-allowed`.

### `LoginModal.jsx`

Centred, `440px` wide, white, `12px` radius, shadow, dark scrim behind. Triggered whenever a
logged-out visitor clicks a gated action. Header reads: **Log in to continue**, sub-line names
the blocked action, e.g. *You need an account to post an errand.*

Fields: email or username, password, black `Log in` button, `Forgot password?` as a blue text
link, and a divider then `Create an account`. Purely visual — closing it or submitting just
flips the demo auth state to logged in.

### `DemoControls.jsx`

A small collapsible chip fixed to the bottom-left, labelled `Demo`. Expands to show toggles:

- Logged in / logged out
- Role: requester / courier
- Jump to any request status

**It must not appear in screenshots.** Hide it entirely when the URL contains `?clean=1`.
Document this in the README.

---

## 6. Mock data

Team member names are used as the sample users, as the brief asks for meaningful demo data.

### `users.js`

```js
export const currentUser = {
  id: 'u1', name: 'Gabriel Yap', initials: 'GY',
  email: 'gabriel@u.nus.edu',
  creditsAvailable: 14, creditsReserved: 6,
  errandsCompleted: 9, rating: 4.8,
};
// Also: Koh Wee Jean (WJ), Tng Wen Xi (WX), Xiao Congchen (XC), Yeo Bing Teck (BT)
```

### `suppliers.js`

Ten food suppliers. Fields: `id`, `name`, `shortName`, `location`, `category`, `hours`
(`{open:'07:30', close:'21:00'}`), `isOpen`, `description`, `activeRequests`, `image`.

| Name | Location | Category | Image filename |
|---|---|---|---|
| The Deck | Faculty of Arts & Social Sciences | Canteen | `deck.jpg` |
| Techno Edge | Faculty of Engineering | Canteen | `techno-edge.jpg` |
| Frontier | Faculty of Science | Canteen | `frontier.jpg` |
| The Terrace | School of Design & Environment | Canteen | `terrace.jpg` |
| PGPR Canteen | Prince George's Park Residences | Canteen | `pgpr-canteen.jpg` |
| Fine Food | UTown | Food court | `utown-finefood.jpg` |
| Flavours @ UTown | UTown | Food court | `utown-flavours.jpg` |
|食堂 @ UTown Plaza | UTown | Food court | `utown-plaza.jpg` |
| COM3 Food Kiosk | School of Computing | Café | `com3-kiosk.jpg` |
| The Coffee Bean @ COM3 | School of Computing | Café | `com3-coffeebean.jpg` |

Set `isOpen` to a mix — at least two closed, so the open/closed indicator (Supplier F1.2.1) is
visible in a screenshot.

### `locations.js`

Delivery destinations for the request form: COM1 Basement, COM2 Level 3 Lounge, LT19,
Central Library, i3 Building, SDE4 Studio, PGP Residence Block A, UTown Residence,
Yusof Ishak House, Kent Ridge MRT. Mark two as bookmarked (nice-to-have: bookmarking).

### `requests.js`

Twelve requests spanning every status. Fields: `id`, `supplierId`, `description`,
`deliveryLocation`, `credits` (3–5), `expiresAt`, `notes`, `status`, `requesterId`,
`courierId`, `createdAt`.

Sample descriptions, in the natural voice of a student, not marketing copy:

- *"1x chicken rice, no cucumber. Chilli separate please."*
- *"Kopi-o kosong and a kaya toast set."*
- *"Any 2 dishes cai fan, no pork. Whatever's left is fine."*
- *"Large ban mian, extra chilli. Please don't let it get soggy."*

At least two requests must be `open` and belong to another user so the courier board has
something acceptable. At least one must be `expired` and one `cancelled`.

### `messages.js`

A chat thread between Gabriel (requester) and Wen Xi (courier) for an in-progress request.
Must contain **at least two non-English messages** so the translate button has something to do.
Include the pre-written English translation alongside each — hardcoded, no API.

```js
{ id:'m4', from:'u3', text:'我到了，你要加辣吗？',
  translation:"I'm here — do you want extra chilli?", lang:'zh' }
```

---

## 7. The seven screens

Requirement IDs in brackets trace to the team's product backlog. Do not add screens.

---

### 7.1 `/` — Landing

*Backlog: User F2, Supplier F1.1. Suppliers visible when logged out; posting and accepting are gated.*

```
┌──────────────────────────────────────────────────────────┐
│ [◨ FoC]        Suppliers  Find errands  My activity  [Log in] │
├──────────────────────────────────────────────────────────┤
│                                                          │
│   Get it fetched.                                        │   ← Bricolage, 3rem, max 2 lines
│   Someone's already heading there.                       │   ← Figtree, ink-70, 1.125rem
│                                                          │
│   ┌────────────────┬───────────────┬──────────┬──────┐   │
│   │ From           │ Deliver to    │ By when  │  ○   │   │   ← 64px tall, white, line border,
│   │ Any canteen    │ Where are you │ Today    │      │   │      999px radius, black circular
│   └────────────────┴───────────────┴──────────┴──────┘   │      search button on the right
│                                                          │
├──────────────────────────────────────────────────────────┤
│  [All] [Canteen] [Food court] [Café] [Open now]          │   ← filter chips, horizontal scroll
│                                                          │
│  Canteens and cafés on campus                            │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                     │
│  │ img  │ │ img  │ │ img  │ │ img  │   ← 4-up grid, 4:3 images
│  └──────┘ └──────┘ └──────┘ └──────┘                     │
└──────────────────────────────────────────────────────────┘
```

The search bar is the hero. It is a single rounded container with internal dividers, each
segment showing a small label above a value — the Airbnb pattern. Clicking any segment opens a
plain dropdown. Clicking the search button navigates to `/suppliers`.

Below the grid, a two-column band on `surface-alt` explaining the credit economy in plain
language: *You start with 20 credits. Run an errand, earn credits. Post one, spend them.
Credits stay inside FoC — they're not money and can't be cashed out.*

**Mobile:** headline `1.75rem`. The search bar collapses to a single full-width pill reading
*Where do you need something from?* which opens a full-screen sheet with the three fields
stacked. Supplier grid becomes 1-up, images 16:9.

---

### 7.2 `/suppliers` — Supplier listing

*Backlog: Supplier F1.1, F1.1.1 search/filter, F1.2.1 open-closed indicator. Checked again at D2.*

```
┌──────────────────────────────────────────────────────────┐
│ [◨ FoC]                                    [14 cr] 🔔 GY │
├──────────────────────────────────────────────────────────┤
│ ┌─────────────┐                                          │
│ │ Filters     │   10 places on campus        Sort: A–Z ▾ │
│ │             │                                          │
│ │ Category    │   ┌────────────┐ ┌────────────┐          │
│ │ ☐ Canteen   │   │   image    │ │   image    │          │
│ │ ☐ Food court│   │            │ │            │          │
│ │ ☐ Café      │   ├────────────┤ ├────────────┤          │
│ │             │   │ The Deck   │ │Techno Edge │          │
│ │ Availability│   │ FASS       │ │ Engineering│          │
│ │ ☐ Open now  │   │ ● Open · 3 │ │ ○ Closed   │          │
│ │             │   │   errands  │ │            │          │
│ │ Faculty     │   └────────────┘ └────────────┘          │
│ │ ...         │                                          │
│ └─────────────┘   ┌────────────┐ ┌────────────┐          │
└──────────────────────────────────────────────────────────┘
```

`SupplierCard`: 4:3 image, name in weight 600, location in `ink-40`, then a status line —
a small filled dot in blue plus `Open until 21:00`, or a hollow `ink-40` dot plus
`Closed · opens 07:30`. If `activeRequests > 0`, append `· 3 open errands` in `ink-70`.

The card's primary action is `Request from here`, which is gated: logged out, it opens
`LoginModal`; logged in, it goes to `/requests/new?supplier=<id>`.

Include a **bookmark icon** in the top-right corner of each image (nice-to-have: bookmarking).
Filled black when bookmarked, white outline when not.

Search input sits above the grid, full width of the results column, placeholder
*Search canteens, cafés, or faculties*.

**Mobile:** filters collapse into a `Filters` button that opens a bottom sheet. Grid is 1-up.
Sticky filter/sort bar under the nav.

---

### 7.3 `/requests/new` — Create an errand

*Backlog: Order F1.1.1 — supplier, description, delivery location, credits offered, expiration, additional details. Plus nice-to-haves: scheduled errands, bookmarked locations.*

Single centred column, `640px` max width. Title in Bricolage: **Post an errand**.

Fields, in this order and no others:

1. **Pick-up from** — supplier selector. If arrived via `?supplier=`, pre-filled and shown as a
   small card with thumbnail, name, and a `Change` text link.
2. **What do you need?** — textarea, 4 rows. Placeholder: *e.g. 1x chicken rice, no cucumber,
   chilli separate.* Helper below in `ink-40`: *Be specific. Your courier is buying this for
   you, so mention anything that matters.* Character counter at 200.
3. **Deliver to** — dropdown of `locations.js`. Bookmarked locations pinned to the top of the
   list under a small `Saved` group heading, each with a filled bookmark icon.
4. **When do you need it?** — segmented control, two options: `As soon as possible` /
   `Schedule for later`. Choosing schedule reveals date and time inputs beneath.
5. **Offer** — credit stepper, `−` and `+` around a large tabular number, range 1–10, default 4.
   Beneath it in `ink-40`: *Most errands to this location are picked up at 3–5 credits.*
   Below that, a live line: *After posting, you'll have 10 of 14 credits available.*
6. **Anything else?** — optional single-line input. Placeholder: *Meet at the side entrance,
   I'm in a lecture until 3.*

Footer bar: left shows `4 credits will be reserved until this errand is completed or cancelled`
in `ink-70`; right has `Cancel` (ghost) and `Post errand` (primary).

**Also render, as a second screenshot state:** the insufficient-credits error. When the offer
exceeds available credits, the stepper border turns `alert`, the post button disables, and a
line appears: *You have 14 credits, 6 of them reserved. Lower your offer or wait for an errand
to complete.* (Backlog: Credit F1.2.2.)

**Mobile:** same order, full width, `16px` gutters. Footer bar becomes sticky to the bottom of
the viewport.

---

### 7.4 `/requests` — Find errands (courier board)

*Backlog: Order F2.1 listing, F2.1.1 detail, F3.1 acceptance, F3.2 validation.*

```
┌──────────────────────────────────────────────────────────┐
│  Find errands                              [14 cr] 🔔 GY │
│  8 open near you                                         │
│  [All] [Near me] [3+ credits] [Expiring soon]            │
├──────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────┐ │
│ │ [img] The Deck · FASS              [open]     ┌────┐ │ │
│ │       "1x chicken rice, no cucumber, chilli   │ 4  │ │ │  ← credit pill, right-aligned
│ │        separate please."                      │ cr │ │ │
│ │       → COM1 Basement · expires in 42 min     └────┘ │ │
│ │       Posted by Wen Xi · 4.9 ★         [ Accept ]    │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

Full-width stacked rows, not a grid — this is a scannable job board, closer to Trivago's result
list than Airbnb's tiles. 88px supplier thumbnail on the left.

Clicking a row expands it inline to reveal the full detail (additional notes, exact expiry
timestamp, requester's completed-errand count). Do not build a separate detail route.

`Accept` behaviour by state — all three must be screenshottable via `DemoControls`:

- Logged out → `LoginModal`.
- Own request → button replaced by disabled `Your errand`, with `ink-40` helper text
  *You can't accept your own errand.* (Backlog: F3.2.1.)
- Already accepted by someone else → row dims to 60% opacity, chip flips to `accepted`, button
  becomes disabled `Taken`. (Backlog: F3.2.3, F3.5.1.)

Include a small live-update affordance at the top of the list — a thin blue line and the text
*Updating live* with a slow pulsing dot — to represent F3.5.2 without faking a websocket.

Empty state: *No open errands right now. Check back in a bit, or post one yourself.* with a
secondary button to `/requests/new`.

**Mobile:** thumbnail shrinks to 64px, credit pill moves to sit beside the supplier name, the
Accept button goes full width at the bottom of the row.

---

### 7.5 `/activity` — My activity

*Backlog: Order F3.4.2 active requests, F5 cancellation, F6 editing, plus the lifecycle the team defined: open → accepted → picked up → delivered → completed.*

Two tabs: **My errands** (as requester) and **My deliveries** (as courier).

Each tab lists cards. The card for an in-progress errand expands to show a horizontal timeline:

```
  ●────────●────────●────────○────────○
 Posted  Accepted  Picked   Delivered Completed
                    up
 14:02    14:09     14:21
```

Completed steps: filled black dots, black connector, timestamp beneath. Current step: orange
ring. Future steps: `line` colour hollow dots, no timestamp.

Action shown depends on the viewer's role and the status. Exactly one primary action per card:

| Status | As requester | As courier |
|---|---|---|
| `open` | `Edit` (secondary), `Cancel errand` (danger) | — |
| `accepted` | `Message courier` | `Mark picked up` |
| `picked_up` | `Message courier` | `Mark delivered` |
| `delivered` | `Confirm and release credits` (primary) | *Waiting for requester to confirm* |
| `completed` | — | — |

Under the `delivered` state on the requester side, add a `ink-40` line:
*4 credits will move to Wen Xi when you confirm.*

Include one `cancelled` and one `expired` card in the list, dimmed, with a `ink-40` line
explaining the credit outcome: *6 credits returned to your balance.* (Backlog: F1.4.1, F4.1.3.)

**Mobile:** the timeline rotates to vertical, dots down the left with labels and timestamps to
the right. Tabs become full-width segmented control.

---

### 7.6 `/chat/:id` — Chat with translate

*Nice-to-have: real-time chat/call, translation.*

Two-column on desktop: `320px` conversation list on the left, thread on the right. Single
column on mobile showing only the thread, with a back arrow.

Thread header: courier's avatar and name, a `ink-40` sub-line naming the errand
(*The Deck → COM1 Basement · 4 cr*), and on the right a phone icon and a video icon.

Bubbles: own messages black fill / white text, right-aligned; theirs `surface-alt` fill /
`ink` text, left-aligned. Max width 70%. `12px` radius with the corner nearest the sender
tightened to `4px`. Timestamps in `ink-40` `0.75rem` beneath each group.

**The translate button — hardcode this, no API:**

Non-English bubbles render a small `Translate` text button beneath them, in blue, with a
languages icon. Clicking swaps the bubble text to the stored `translation` string over a 150ms
crossfade, and the button becomes `Show original`. A `0.75rem` `ink-40` line appears above the
translated text: *Translated from Chinese*.

Also add a toggle in the thread header: `Auto-translate` with a small switch. When on, all
non-English bubbles render pre-translated on load, each with the *Translated from …* label.
This gives a much stronger screenshot than the per-message version — capture both.

Composer at the bottom: rounded input, `Message Wen Xi`, paperclip icon, black circular send
button.

---

### 7.7 `/wallet` — Credits

*Backlog: Credit F1.5.1 balance with reserved/unreserved, F1.5.2 transaction history, F2.1.1 logged detail.*

This is the most distinctive screen in the product. Give it the boldest treatment.

```
┌──────────────────────────────────────────────────────────┐
│  Your credits                                            │
│                                                          │
│    ┌──┐                                                  │
│    │14│ available          6 reserved · 20 total         │   ← lg CreditPill, 28px number
│    └──┘                                                  │
│                                                          │
│  ████████████████████████░░░░░░░░░░                      │   ← single bar, 12px tall, 999px
│  Available                Reserved                       │      black fill / orange fill
│                                                          │
│  Credits stay inside FoC. They aren't money and can't    │
│  be bought, cashed out, or transferred outside a         │
│  completed errand.                                       │
├──────────────────────────────────────────────────────────┤
│  Activity                          [All ▾]               │
│                                                          │
│  ↓  Errand completed · Techno Edge      Yesterday   +4   │
│     From Congchen                                        │
│  ⊘  Reserved for errand · The Deck      Yesterday   −4   │
│  ↑  Errand completed · Frontier         3 Sep       −5   │
│  ↺  Errand expired, credits returned    2 Sep       +3   │
│  ★  Welcome bonus                       28 Aug     +20   │
└──────────────────────────────────────────────────────────┘
```

The bar is the one place orange gets real surface area — reserved credits in `orange`,
available in `ink`, on a `surface-alt` track.

Transaction rows: a `28px` circular icon in `surface-alt`, then a two-line description (type
and counterparty), then date in `ink-40`, then the delta right-aligned in tabular figures —
`+` values in `ink`, `−` values in `ink-40`. No red, no green; this is a closed economy, not a
bank account.

Each row expands on click to reveal the logged detail from backlog F2.1.1: transaction type,
user, amount, timestamp, and the linked errand ID.

**Mobile:** the balance block stacks, the bar goes full width, transaction rows drop the date
column into the second line.

---

## 8. Responsive rules

Breakpoints: `<768px` mobile, `768–1023px` tablet, `≥1024px` desktop.

Every screen must be checked at exactly **393px** (iPhone 14 Pro) and **1440px**. Those are the
two widths that get screenshotted.

Rules that apply everywhere:

- No horizontal scroll at 393px, ever. Verify each page.
- Tap targets minimum 44×44px on mobile.
- Page gutters: `16px` mobile, `24px` tablet, `40px` desktop with content capped at `1200px`.
- Sticky footers on mobile for any screen with a single primary action (create request).
- The top nav collapses to hamburger below 768px.

---

## 9. Routing and demo state

`DemoContext` holds: `isLoggedIn`, `role`, and a `requests` array so status changes made
through the UI persist for the session. No localStorage — it will be wiped on refresh and that
is fine.

Gated actions when logged out: post an errand, accept an errand, open chat, view wallet, view
activity. Each opens `LoginModal` rather than redirecting, so the underlying page stays visible
behind the scrim — which makes a better screenshot.

---

## 10. Images — read this carefully

**Do not source, generate, or invent any photographs.** The team is supplying them.

Build against the exact filenames in §6, in `public/images/suppliers/`. Until a file exists,
`SupplierImage` renders its placeholder, and the app must look deliberate in that state — grey
block, icon, supplier name, *Image pending*.

When you have finished building, **print a checklist to the terminal** in this form, so the
team knows precisely what to drop in and where:

```
Images needed — place in foc-mockup/public/images/suppliers/
  [ ] deck.jpg              The Deck                    4:3, ≥1200px wide
  [ ] techno-edge.jpg       Techno Edge                 4:3, ≥1200px wide
  ... (all ten)
Landscape orientation. JPG or WebP. Under 500KB each.
```

Then stop and tell the user the app is ready to view, and that images can be added at any time
without touching code.

---

## 11. Definition of done

- [ ] `npm run dev` starts cleanly; `--host` prints a LAN URL
- [ ] All 7 routes render with zero console errors
- [ ] No horizontal scroll at 393px on any route
- [ ] Every interactive element has a visible focus ring
- [ ] `?clean=1` hides the demo controls completely
- [ ] Every file carries the AI attribution header
- [ ] `AI-NOTES.md` written
- [ ] `README.md` covers: how to run, how to view on a phone, how to add images, how to
      screenshot with `?clean=1`, and which backlog requirement each screen demonstrates
- [ ] Image checklist printed to terminal
- [ ] Nothing outside `foc-mockup/` was modified

---

## 12. Ask the user before you decide

These are open. Do not resolve them yourself — ask, and wait.

1. **`AGENTS.md` at the repo root** — read it before starting. If it sets conventions that
   conflict with anything here, raise the conflict rather than picking a side.
2. **The expired-confirmation gap.** The lifecycle ends `delivered → completed` on requester
   confirmation. Nothing in the backlog says what happens if the requester never confirms, so
   credits would stay reserved forever. The `delivered` state in §7.5 is built without any
   auto-confirm affordance. Flag this to the team; it is theirs to specify, not yours.
3. **Faculty names.** Verify the faculty attributed to each supplier in §6 with the team before
   shipping — a wrong building on screen in front of NUS graders is an avoidable own goal.
4. If a screen seems to need a component not listed in §5, ask before adding it.
