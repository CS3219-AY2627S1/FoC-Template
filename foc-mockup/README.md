<!--
  AI Assistance Disclosure:
  Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
  Scope: Generated UI mockup component README.md from team-authored blueprint.md.
         Visual/layout implementation only. No requirements, architecture, or
         schema decisions were made by the AI tool.
  Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.
-->

# FoC — D1 UI mockup

A static, non-functional UI prototype for the Week 5 presentation. No backend, no API calls,
no database, no auth. Every piece of data is hardcoded in `src/data/`. Buttons navigate and
toggle local state; nothing persists across a refresh.

Built from `blueprint.md` at the repo root. Nothing outside this folder was modified.

## Run it

```bash
cd foc-mockup
npm install
npm run dev
```

Vite prints two URLs. `Local:` is for this machine; `Network:` is the LAN URL.

## View it on a phone

`npm run dev` runs `vite --host`, so the `Network:` URL (something like
`http://192.168.1.42:5173/`) works from any device on the same Wi-Fi. Open it on the phone you
want to screenshot from. If it does not load, allow Node through the Windows firewall for
private networks, or check that the phone is not on a guest SSID.

## Screenshot mode

The demo panel (bottom-left, labelled **Demo**) must not appear in screenshots.

Append `?clean=1` to any URL to hide it completely:

```
http://localhost:5173/requests?clean=1
http://localhost:5173/wallet?clean=1
```

Capture each screen at exactly **393px** (iPhone 14 Pro) and **1440px**. Both widths have
been checked in a browser on every route — see AI-NOTES.md §5. Note that a full-page capture
can stitch the sticky nav down the middle of the image; that is the capture tool, not the
layout. In Chrome DevTools:
`Ctrl+Shift+M`, set the width, then `Ctrl+Shift+P` → "Capture full size screenshot".

## The demo panel

Expand the **Demo** chip to drive states that are otherwise hard to reach:

- **Auth** — logged in / logged out. Logged out, gated actions open the login modal over the
  page rather than redirecting, which makes a better screenshot.
- **Role** — requester / courier. Sets which tab `/activity` opens on.
- **Jump a request to a status** — pick any of the twelve requests and move it to any status.
  This is how you capture the three Accept states on `/requests` and each lifecycle stage on
  `/activity`.

## The supplier model

A **supplier is a stall**, not a canteen. "The Deck" is a `venue` attribute on the stall, and a
stall may have no venue at all. `src/data/suppliers.js` is one flat list — one row per orderable
place. The venue grouping on the home page and `/suppliers` is a *view* over that list, not a
parent-child relationship, and `supplierId` on a request always points at exactly one row.

Search matches stall name **and** venue name: "Deck" returns all four Deck stalls, "laksa"
returns the one stall.

## Adding photos

`image` on each supplier is a path under `public/images/`, so both folders work from one field.
Extensions differ per file and are part of the name — if you swap a photo for a different
format, update the `image` field in `src/data/suppliers.js` or the placeholder comes back.

| `image` path | Supplier | Venue | Present |
|---|---|---|---|
| `stalls/roasted delight.webp` | Roasted Delights | The Deck | yes |
| `stalls/japanese.jpg` | Japanese | The Deck | yes |
| `stalls/yongtaufooandlaksa.jpg` | Yong Tau Foo & Laksa | The Deck | yes |
| `stalls/vegetarian.jpg` | Vegetarian | The Deck | yes |
| `suppliers/utownfinefood.jpg` | Fine Food | UTown | yes |
| `suppliers/flavours.jpg` | Flavours | UTown | yes |
| `suppliers/utownplaza.png` | 食堂 | UTown Plaza | yes |
| `stalls/tomorocoffee.jpg` | Tomoro Coffee | Hong Swee Sen Memorial Library | yes |
| `suppliers/frontier.png` | Frontier | — | yes |
| `suppliers/terrace.png` | The Terrace | — | yes |
| `suppliers/PGP-canteen.jpg` | PGPR Canteen | — | yes |
| `suppliers/techno-edge.jpg` | Techno Edge | — | **no — placeholder** |
| `stalls/cool-spot.jpg` | Cool Spot | — | **no — placeholder** |
| `stalls/spinelli.jpg` | Spinelli Coffee | — | **no — placeholder** |

`roasted delight.webp` contains a space. That works — each path segment is URL-encoded — but if
you rename the file, update the `image` field too.

Landscape, roughly 4:3, at least 1200px wide. **Under 500KB each: `frontier.png` (1.7MB),
`terrace.png` (3.3MB) and `utownplaza.png` (3.4MB) need recompressing** before the presentation,
since the mockup gets loaded over Wi-Fi on a phone.

Drop a file in and refresh — no code changes, no restart. Anything missing keeps showing the
grey *Image pending* placeholder, so photos can be added one at a time.

## What each screen demonstrates

| Route | Screen | Backlog requirements |
|---|---|---|
| `/` | Landing | User F2 (suppliers visible logged out, posting/accepting gated), Supplier F1.1 |
| `/suppliers` | Supplier listing | Supplier F1.1, F1.1.1 search/filter, F1.2.1 open-closed indicator; bookmarking (nice-to-have) |
| `/suppliers/:id` | Stall detail | Supplier F1.1 — **added at the team's direction after the blueprint was written**; see AI-NOTES.md |
| `/requests/new` | Create an errand | Order F1.1.1 (supplier, description, location, credits, expiration, details), Credit F1.2.2 insufficient credits; bookmarked locations (nice-to-have). Two separate clocks: `completeBy` (deliver-by deadline) and `expiresAt` (how long it stays open unaccepted) — see AI-NOTES.md §6d |
| `/requests` | Find errands (courier board) | Order F2.1 listing, F2.1.1 detail, F3.1 acceptance, F3.2 / F3.2.1 / F3.2.3 validation, F3.5.1 / F3.5.2 updates |
| `/activity` | My activity | Order F3.4.2 active requests, F5 cancellation, F6 editing, lifecycle open → accepted → picked up → delivered → completed, F1.4.1 / F4.1.3 credit outcomes |
| `/chat/:id` | Chat with translate | Real-time chat/call and translation (nice-to-have) |
| `/wallet` | Credits | Credit F1.5.1 balance with reserved/unreserved, F1.5.2 transaction history, F2.1.1 logged detail |

`/requests/new`, `/activity`, `/chat/:id` and `/wallet` are gated: visiting them logged out
opens the login modal over the page.

## Stack

Vite + React 18 + JavaScript + Tailwind CSS + react-router-dom, with `lucide-react` for icons.
No component library, no state manager, no UI kit.
