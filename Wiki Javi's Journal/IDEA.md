---
name: javis-journal
title: Javi's Journal
status: design
created: 2026-07-02
updated: 2026-07-05
---

# Javi's Journal

## Problem / Motivation
QueensJournal (aka QJournal) is *almost* the perfect journaling/scrapbook app for
Javi, but three specific frustrations make daily use annoying, in her own words:

1. "It doesn't let you adjust the size of the pictures to adjust the fit of the stamp."
2. "The calendar starts on a Sunday instead of Monday, or letting the user change the starting day."
3. "The app froze after 20 days of usage or so."

For Javi, journaling is **both a daily reflection habit** (a small ritual to think
about her day) **and an aesthetic hobby** (she enjoys making pretty pages). The app
therefore has to serve the ritual *and* be a delight to look at.

The concept for this project: turn each of her dislikes into a hard functional
requirement, and build a personalized web app that fixes exactly those pain points —
as a birthday gift.

## Target User
The **only** user is Javi (my girlfriend). She's a current QueensJournal user who
journals daily, cares deeply about visual/aesthetic customization, and uses the app on
**both her phone and her desktop**. She loves seeing the whole month fill in as she
keeps her streak. She's a Pokémon fan.

This is a one-person, personalized gift — not a general product. It should still feel
polished, not like a rough prototype. If it turns out great, scaling to more users is a
"maybe later," explicitly **not** a v1 concern.

## Core Concept
**Javi's Journal** — a personal, fully-responsive web app where Javi keeps a daily
journal as a **decorable canvas**. Each calendar day is a page she decorates by placing
**photos as resizable stamps** and adding **her own uploaded stickers** (WhatsApp-style).
The **minimum lovable entry is deliberately simple: a single photo** — but she can add
more stamps/stickers and arrange them freely if she wants. Entries live on a
**customizable calendar** (Monday-start by default, changeable) with a **full-month view**
so she can watch her progress fill in — the thing she loves most about QueensJournal.

The signature interaction is the **stamp cutter**: she uploads a photo, picks a **stamp
shape** (classic postage-stamp frame, circle, heart, square, etc.), **pans & zooms the
photo behind the shape mask** to fit it perfectly, and cuts it into a reusable stamp.
That pan/zoom-to-fit *is* the direct fix for her #1 frustration.

Built on a cloud backend so it stays **fast and stable for long-term daily use** — no
~20-day freeze — and syncs across her phone and desktop.

**Guiding principle (north star): "the journal that never fights her."** All three of her
gripes are moments the old app broke her flow, so v1 prioritizes **friction removal over
feature count**. Scope this as a **"birthday edition" launch**: polish only what's needed
for her *first month* of real use (today-flow, month view, reliable silent save/sync, core
decoration + the cutter), architected so it won't buckle at day 20+ — and treat everything
else as post-launch. The stamp cutter is the **signature feature**; a superb cutter plus a
simple, reliable rest beats many half-polished controls.

## Why Now / Why Me
- **Real deadline:** it's a birthday gift. Her birthday is **2026-07-18**; heavy build
  through **2026-07-15**, then testing/polish. ~13 days of runway from 2026-07-02.
- **I know the exact pain points** — she told me the three things she hates, so I can
  fix precisely the right things instead of guessing.
- **I can tailor every detail to her taste** (soft cozy pastel aesthetic, Pokémon
  frames, seeded surprises) in a way no commercial app can.
- **As a free personal build I sidestep the paywalls / per-sticker charges / platform
  limits** that hold the commercial scrapbook apps back.
- **Focused, buildable scope** — a scrapbook canvas + calendar, not a moonshot.
- I'm an experienced software engineer; this isn't my first app.

## Scope
**In (v1):**
- Daily entry = a **decorable canvas** per calendar day, with **free placement** of
  elements within that day's square/page.
- **Photo stamps** with the **stamp cutter**: upload photo → choose **shape mask**
  (postage-stamp / circle / heart / square / …) → **pan & zoom the photo behind the
  mask** to fit → cut into a stamp. (Directly fixes "resize picture to fit stamp.")
  The cutter is **non-destructive** — store the original image + crop transform + mask
  type, not a baked cutout, so she can re-fit any stamp later.
- **Custom stickers**: upload her own images (WhatsApp-style), saved to a reusable
  personal stamp/sticker tray.
- **Simple layering only**: drag-to-reorder / bring-to-front + send-to-back, backed by an
  **explicit numeric layer-order field** (not DOM order) so it syncs deterministically.
  Explicitly **not** a mentally-taxing layer manager — simplicity over power is a hard constraint.
- **Minimum lovable entry = one photo** (simple by design); richer multi-stamp/sticker
  compositions are possible but never required.
- **Calendar** with **configurable start-of-week** (Monday default, user-changeable) —
  fixes frustration #2.
- **Full-month calendar view** showing per-day progress, with a **"Today" shortcut**.
  This is the emotional payoff screen (she loves watching the month fill in) — invest
  polish here, and keep it excellent on **both phone and desktop**.
- **Pokémon-style calendar frames**: selectable pixel-art borders for the month view,
  modeled on the Gen 3–4 text-box "FRAME TYPE" styles (RSE / DP / Platinum / HGSS), a
  hidden nod to her love of Pokémon. Ship **3–4 polished frames** for v1 (clean 9-slice /
  `border-image` assets); add the rest post-launch.
- **Personal seeded assets**: 3–5 personal stickers/frames (initials, inside jokes, a
  favorite motif) so the tray feels intentional and personal, not generic.
- **Silent optimistic autosave**: every edit writes **instantly to local storage
  (IndexedDB) and renders immediately** — no spinner, no waiting — with a **debounced
  background sync** to the cloud. Only a subtle "offline — will sync" hint appears if the
  network drops. Local-first is what makes it feel instant on a phone.
- **Cloud-backed persistent storage** that survives long-term daily use with no freeze —
  fixes frustration #3. See "Key technical constraints" below; blob storage for images
  alone does **not** fix freezing.
- **Phone-first, fully responsive** — the **editor is polished for phone** (where she
  journals daily); desktop editing is functional/secondary. Month view excellent on both.
  Either way, the opposite of QueensJournal's zero-responsiveness.
- **Google login**; after Javi creates her account on her birthday, **disable signup**
  so it's effectively locked to her — with an **owner-override path** so a bad first
  login / mobile popup-auth failure can't lock her out of her own gift.
- **Cross-device sync** (start on phone, continue on desktop).
- **Soft cozy pastel aesthetic** throughout.
- **Birthday fireworks animation** on first open (detailed near the deadline).

**Out (v1 — later or never):**
- **Text overlay of any kind** — no on-canvas text, no Instagram-style text stickers, no
  separate reflection/notes field in v1. (Cut to protect the deadline; revisit post-launch.)
- Multi-user / accounts / sharing / community stamp marketplace.
- Background-remover cutter (auto cutout) — parked; shape-mask cutter only for v1.
- **Stamp/element rotation** — complicates hit-testing, touch handles, and export math.
- **Snapping / alignment guides** — keep free placement; no snapping.
- **Full layer manager/panel** — front/back is enough; a panel makes it feel like software.
- **Completed-day markers** in month view — deemed unnecessary.
- **"Duplicate yesterday's layout"** — nice, but parked to post-launch.
- Search, tags, mood tracking, habit checkboxes.
- Pre-made page templates / theme packs beyond the pastel look + Pokémon frames.
- Export / print, social features.
- Native mobile apps (web only).

### Key technical constraints (the two hardest parts)
**Stability / "no freeze" (the direct fix for frustration #3):**
- **Virtualize journal history** — never keep every day's canvas mounted at once (most
  likely cause of the original ~20-day freeze).
- **Thumbnails for month view** — never load full-res images across the whole month.
- **Client-side image compression on upload** — normalize EXIF orientation and resize
  before storing (phone photos are 8–20MB); keep thumbnails separate from originals.
- **Persist structured element data + image refs**, not a re-baked canvas blob per edit;
  **debounce autosave** to gesture-end, not per-frame.
- **Revoke object URLs / release offscreen canvases** after crops to avoid memory leaks.
- **Validate with the simulated 30–60 day long-run test using realistic image weight**,
  not tiny placeholders — this is the hard gate.

**Shape-mask cutter (the signature feature):**
- **Coordinate-transform precision** is the main bug source (natural vs displayed size,
  zoom, pan offset, device-pixel-ratio must line up) — otherwise "looked right, shifted
  after cutting."
- Prefer **canvas-based clipping for final export** over CSS `clip-path` — Safari/iOS is
  inconsistent, especially for heart / postage-stamp-edge masks.

**Phone-first editor (top design risk):**
- On a phone, **drag / resize / pan-zoom / layer-select gestures can conflict badly**
  (e.g. a resize drag vs. a canvas pan). This is the #1 *design* risk once the
  editor is phone-first — prototype the gesture model early and test on a real device, not
  just a desktop browser's mobile emulator.
- **Extras stay last-mile:** fireworks and decorative flourishes must never compete with
  editor reliability. Instability under a party animation feels worse than no animation.

## Market / Competition
QueensJournal / QJournal (by designer @jeongyoon.design) is a digital scrapbooking app —
"turn your photos into a digital journal," decorate pages with photo + decorative stamps.
Reviewers call it *"so fun, a great way to journal digitally, low effort."* It went
semi-viral on TikTok. Category research (across comparable scrapbook/journal apps)
surfaced consistent complaints and wishes:
- **Import-your-own stamps/stickers** — the single most-requested missing feature.
- **Layers / reorder photos** — recently added elsewhere and loved.
- **Paywall fatigue** — per-sticker charges, page limits, surprise subscriptions.
- **No web / cross-device version** — many competitors are iPhone-only.
- **No search / tags / templates** on the simpler apps.

**How Javi's Journal differs:**
- **Free & personal** — no paywalls or per-sticker charges (the #1 category complaint).
- **Truly cross-device web app** — beats the iPhone-only competitors.
- **Fixes her exact three pain points** — resize-to-fit, configurable week-start, stability.
- **Custom sticker uploads** — the most-requested missing feature, included in v1.
- **Personal touches** no product can match — Pokémon frames, pastel styling, birthday surprise.
- Trade-off: **not a general product** — no marketplace, no community. Fine; it's a gift.

## Success Metrics
Because the gift is a surprise, Javi **cannot** be part of the feedback loop during the
build. Success is therefore defined as **self-verifiable acceptance criteria** to confirm
before 2026-07-18:
- **All 4 core fixes demonstrably work:** photo resize-to-fit (via the cutter),
  configurable week-start, fully responsive on a real phone + desktop, and **no
  crash/freeze under a simulated long-run test** (script 30–60 days of entries with
  photos; confirm stable memory/performance). This long-run test is a **hard gate** — the
  only way to catch the freeze bug without waiting 20 real days.
- **Both bonus features work:** custom sticker upload + simple layering.
- **Editor feels good on phone** (primary surface) — drag/resize/pan-zoom gestures don't
  fight each other; adding a photo and placing it is quick one-handed.
- **Silent autosave never makes her wait** — edits render instantly; sync happens in the
  background; recovers gracefully from a dropped connection.
- **Full-month calendar view** renders correctly, shows per-day progress, has a Today
  shortcut, and looks great on both phone and desktop.
- **Pokémon frame switching** works on the month view (3–4 polished frames).
- **Cross-device sync verified:** create on phone → appears on desktop.
- **Auth can't lock her out:** owner-override path tested before gifting.
- **Shipped & deployed** to a real URL before 2026-07-18, account-ready for Javi.
- Stretch: a lightweight seed/demo so it doesn't feel empty on day one; birthday
  fireworks on first open.

## Open Questions
- **Aesthetic references (taste risk = delivery risk):** because it's a surprise there's
  no feedback loop, so a technically-correct app that misses her actual page-making *style*
  will feel less personal. Covertly gather 3–5 real references of her taste (Pinterest
  board, favorite colors, room palette, QueensJournal pages she made) — treat this as risk
  mitigation, not a nice-to-have.
- **Stamp shapes to ship:** finalize the exact shape set (postage / circle / heart /
  square / oval / …) and whether stamps get the white postage border + perforations.
- **Canvas freedom:** confirmed free placement, no rotation, no snapping. Remaining: any
  undo / confirm-on-delete to guard against accidental touch-drag deletes?
- **Pokémon frames as assets:** pick the best **3–4** of the 10 selected PNGs
  (`C:\Users\olgui\Downloads\calendar frame inspo`) and recreate them as clean 9-slice /
  `border-image` pixel-art frames; confirm they read well at web scale and on mobile.
- **Auth lock mechanism:** exact way to "disable signup after her account exists"
  (allowlist her Google email / flip a flag / single-account guard) **plus** the
  owner-override recovery path.
- **Birthday fireworks:** trigger + animation approach — deferred to near the deadline,
  and strictly last-mile (must not compete with editor reliability).
- **Seeding the gift:** pre-load a few entries (photos of us) as a surprise, or hand it
  empty? (Deferred.)

New questions raised by Codex's review:
- ~~**Minimum lovable entry**~~ — **resolved: a single photo.** Simple by design; richer
  compositions optional.
- ~~**Plain-text reflection area**~~ — **resolved: no text in v1** (see Out list).
- **Day canvas shape:** square (better month thumbnails) vs. a vertical phone-story
  canvas (may feel better on phone)? **Deferred to `/idea-plan`.**
- **Large photo handling:** max dimensions, compression quality, keep originals?
- **Sync-conflict recovery:** what happens if the same day is edited on two devices?
- **Pokémon overtness:** fully hidden nod, or an occasional overt callback?
- **Empty-state / day one:** does it need pre-seeded content to feel intentional?
