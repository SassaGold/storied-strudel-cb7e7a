# Data safety declaration — Vegvísir

**Draft for the Play Console questionnaire. Not yet submitted.**

## Why this exists

The live declaration is wrong. Play currently shows, on the public listing:

> **No data collected** · **No data shared with third parties**

The app transmits precise location off-device on ordinary use. Play's own
definition, quoted from the Console questionnaire:

> *"'Collected' means data that is transmitted off the user's device, either to
> you or a third party."*

Ephemeral processing does not exempt it — the same page says such data *"must
still be disclosed, but will not be shown to users on your store listing."* So
"no data collected" is not an available answer.

**Do not submit while a release is in review.** Editing App content mid-review
stacks a change onto the pending one. Correct this once 1.4.0 clears, alongside
1.4.1.

---

## What actually leaves the device

Audited against the source on 2026-07-25. Every endpoint is in `lib/config.ts`.

| Host | Trigger | What is sent |
|---|---|---|
| `nominatim.openstreetmap.org` | Rider HQ load / Update location | precise coordinates |
| `api.open-meteo.com` | Rider HQ load / Update location | precise coordinates |
| `overpass-api.de` | opening a POI tab (auto-searches) | precise coordinates |
| `overpass.kumi.systems` | opening a POI tab (round-robin with the above) | precise coordinates |
| `tile.openstreetmap.de` | any map view | the tile area being viewed |
| `*.wikipedia.org` | opening a place description | a place name, **not** coordinates |

Nothing goes to a SassaGold server, because there is none.

Most of these fire **automatically** on screen load, not on an explicit user
action — Rider HQ geocodes and fetches weather when it opens, and the POI tabs
search on open. That matters: it rules out leaning on Play's "user-initiated
transfer" carve-out for most of the traffic.

Not transmitted, verified: no push tokens (`expo-notifications` is used for
local notifications only — no `getExpoPushTokenAsync` anywhere), no analytics or
crash SDK in `package.json`, no advertising ID, no account or device identifier.

Trip routes were sent to `router.project-osrm.org` in every build from **1.1.7**
through **1.4.0**. Removed on 2026-07-25; the fix ships in the first release
after 1.4.0. If this declaration is submitted while 1.4.0 is still the live
build, that upload is still happening.

---

## Proposed answers

### Step 2 — Data collection and security

| Question | Answer | Why |
|---|---|---|
| Does your app collect or share any of the required user data types? | **Yes** | precise + approximate location leave the device |
| Is all user data collected by your app encrypted in transit? | **Yes** | every endpoint in `lib/config.ts` is HTTPS; verified none are `http://` |
| Do you provide a way for users to request that their data is deleted? | **No** | there is no server-side data to delete. In-app: Settings → Clear cache, per-ride delete, or uninstall |

### Step 3 — Data types

Only **Location** is collected. Every other category — personal info, financial,
health, messages, photos, audio, files, calendar, contacts, app activity, web
browsing, app info and performance, device or other IDs — is **not collected**.

| | Precise location | Approximate location |
|---|---|---|
| Collected | **Yes** | **Yes** |
| Shared | **Yes** | **Yes** |
| Processed ephemerally | **Yes** | **Yes** |
| Required or optional | **Optional** — the app runs without granting location | same |
| Purpose | **App functionality** only | same |

Approximate location is included because the app declares
`ACCESS_COARSE_LOCATION` alongside `ACCESS_FINE_LOCATION` (`app.json`), so a
coarse fix can be what gets sent.

"Processed ephemerally" is accurate: coordinates are used to service a single
request and are not retained by us — we operate no server. It does **not**
remove the duty to declare; it only keeps the entry off the public listing card.

---

## Two judgment calls, flagged rather than buried

**1. "Shared" — declared Yes, and this is the conservative reading.**
Play excludes transfers to service providers acting on the developer's behalf.
Nominatim, Overpass, Open-Meteo and the OSM tile servers are independent public
services, not contracted processors, so the exclusion does not apply. There is
also a carve-out for transfers a user specifically initiates — but as noted
above, most of this traffic fires automatically on screen load. Declaring
`Shared: Yes` is defensible and safe; declaring `No` would require an argument
this app cannot make.

**2. Data deletion — answered No.**
Play wants a URL if you answer Yes. There is nothing held off-device to delete,
so a deletion endpoint would be theatre. If the reviewer pushes back, the honest
expansion is: all data is on-device and removable via Settings → Clear cache,
per-ride delete, or uninstalling.

---

## Before submitting

- Only step 1 of the 5-step wizard has been read. **Verify the wording and the
  exact fields against the live form** — this draft is the intended answers, not
  a transcript.
- Re-check the host table above against `lib/config.ts` if any release has
  shipped since 2026-07-25.
- The **privacy policy** at `sassagold.com/privacy` already lists every host in
  this table, in all five locales, so the two are consistent.
