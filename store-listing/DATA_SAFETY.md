# Data safety declaration — Vegvísir

**Entered in the Play Console on 2026-07-26 and saved.** It is staged in
Publishing overview as *"Complete Data safety questionnaire"* and has **not yet
been sent for review** — press *Submit changes for review* to do that. Nothing
reaches the public listing until then.

Entered by CSV import, not by clicking: the questionnaire has **Export to CSV /
Import from CSV** buttons, which is far faster and auditable. The exact file that
was imported is `data-safety.csv` in this directory, and `data-safety-build.js`
regenerates it from a fresh export. Re-export before reusing — the schema is
Google's and can change.

> ⚠️ **One answer differs from the original draft: `Processed ephemerally` is
> now `No`, not `Yes`.** See "Two judgment calls" below for why the answer was
> reversed. The tables in this file reflect what was actually submitted.

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
| `www.yr.no` | **tapping** the weather card | precise coordinates at 4 dp (~11 m), in the URL path |

Nothing goes to a SassaGold server, because there is none.

`yr.no` is the one genuinely user-initiated transfer, and the only entry here that
is not an in-app `fetch`: `WeatherCard` calls `Linking.openURL(weatherUrl)`
(`components/WeatherCard.tsx:122`), handing a URL built in `lib/useRiderHQ.ts:369`
to the external browser. Play's user-initiated carve-out does apply, so it does
not change any answer below — it is listed because this table claims to be a
complete account of what leaves the device.

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
| Processed ephemerally | **No** | **No** |
| Required or optional | **Optional** — the app runs without granting location | same |
| Purpose | **App functionality** only | same |

Approximate location is included because the app declares
`ACCESS_COARSE_LOCATION` alongside `ACCESS_FINE_LOCATION` (`app.json`), so a
coarse fix can be what gets sent.

Two further answers the questionnaire demands once collection is `Yes`, both
accurate and both entered: account creation → *"My app does not allow users to
create an account"*, and *"Can users login with accounts created outside of the
app?"* → **No**. The app has no auth of any kind. The export marks the second
`OPTIONAL`, but the form blocks on it, so it must be in the CSV.

**Resulting public store-listing card**, read from the Step 5 preview:

| Section | Shows |
|---|---|
| Data shared | Location — Approximate, Precise |
| Data collected | Location — Approximate, Precise |
| Data deletion | Developer hasn't provided a way to request data deletion |
| Security practices | Data is encrypted in transit |
| Privacy policy | `https://sassagold.com/privacy` |

---

## Three judgment calls, flagged rather than buried

**0. "Processed ephemerally" — reversed to No on 2026-07-26.**
The original draft answered `Yes`, reasoning that coordinates service a single
request and are not retained *by us*, since we run no server. That reasoning is
sound about our own infrastructure and wrong about the question. Play's
definition — *"only stored in memory, and is retained for no longer than
necessary to service the specific request in real-time"* — describes what happens
to the data **after it leaves the device**, which here means what Nominatim,
Overpass, Open-Meteo and the OSM tile servers do with it. They are independent
public services that log requests; we cannot assert in-memory-only retention on
their behalf.

It also mattered publicly. With `ephemeral: Yes` the Step 5 preview still read
*"No data collection declared — The developer says this app doesn't collect user
data"*, because ephemeral collection is disclosed to Google but hidden from the
listing card. That is the exact sentence this whole correction exists to remove.
Answering `No` surfaces Location under **Data collected** as well as **Data
shared**.

The risk is asymmetric: over-declaring collection costs nothing, while
over-claiming ephemerality is a misdeclaration of the same species as the one
being fixed.

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
- ✅ **Host table re-audited against `lib/config.ts` on 2026-07-26.** Endpoints
  are unchanged apart from the two removals landing in 1.4.1, both verified gone
  from source (only explanatory comments remain): `router.project-osrm.org` and
  the `maps.mail.ru` Overpass mirror. Every remaining endpoint is `https://` —
  the only `http://` in the codebase is the GPX XML namespace in `lib/gpx.ts:32`,
  which is an identifier, not a request. The re-audit added the `yr.no` row above,
  which the 2026-07-25 pass had missed. **No proposed answer changes.**
- The **privacy policy** at `sassagold.com/privacy` already lists every host in
  this table, in all five locales, so the two are consistent. Note it does not
  mention `yr.no`; harmless, since that transfer is user-initiated and goes to the
  browser, but worth adding for symmetry the next time those pages are touched.
- The blocking gate is **lifted**: the 1.4.0 listing change set cleared review on
  or before 2026-07-26 (confirmed from the public listing — the Vegvísir rename is
  live, including the brand-new da-DK and is-IS titles). Confirm no *other* change
  is pending in Publishing overview before opening the questionnaire.
