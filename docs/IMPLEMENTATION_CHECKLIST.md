# Unifest Studios: reliability and editing checklist

Branch: `reliability-p1` (local commits only, not deployed).
Status key: **Done** · **Partial** · **Blocked** · **Not started**.
"Verified" means checked with tests and/or in the browser; "unverified" is stated where it applies.

## Baseline (before this work, 18 Nov 2026)

- **Build and tests:** `npx tsc -b`, `npm run build` and `npx vitest run` passed, with 108 tests.
- **Workspaces:** Ground, Stage, Set, Truss, LED, Seats, Decor, 3D Model, 3D Visualizer, Plan and Deliver all opened without errors on the College Fest template (dev preview, Chromium in the desktop app).
- **Observed defects:**
  - Opening 3D without WebGL blanked the whole app. It had no error boundary or WebGL check.
  - Capacity ignored the venue edges and counted overlapping zones twice. The shrunk College Fest venue still said "fits".
  - The dashboard, CSV and generator plan each counted weight and power from a different set of items.
  - A failed autosave was silent.
  - Sliders and the name field made one undo step per change.
  - Opening another project kept the old undo history.
- **Performance:** not yet measured for this checklist (see Priority 10).

## Priority 0: review and baseline. Done

Mapped:
- Every `<Canvas>`: `Viz3D.tsx` Viewer, `Model.tsx` Viewport and `SetCad3D.tsx`.
- Saving: `store.ts` autosave and cloud save, and `library.ts` keys.
- Undo history: zundo, limit 100.
- Capacity: `calc.ts` → now `capacity.ts`.
- Totals: `calc.totals`, `export/equipment.ts`, `quote.fullEquipment` and `resources.generatorPlan`.
- Warnings and safety: `warnings.ts`, `safety.ts`.
- Exports: `export/*`.

## Priority 1: reliability and correctness

| Item | Status | Notes |
|---|---|---|
| 1. 3D failure containment | **Done**, verified in the browser | See below. |
| 2. Capacity feedback | **Done**, 9 tests and browser check | See below. |
| 3. Weight and power definitions | **Done**, test and browser check | See below. |
| 4. Recoverable changes | **Done** for the items below, 4 tests and browser check | See below. Partial items are listed separately. |

**1. 3D failure containment** (`components/Safe3D.tsx`)
- Checks for WebGL first. Adding `?nogl` to the address simulates a browser without it.
- Error boundaries catch failures and offer Try again.
- A lost graphics context is handled, with a way back to 2D.
- Root and per-workspace boundaries offer Reload and Download backup.
- Tested in the browser:
  - WebGL unavailable (3D Visualizer, Model, CAD 3D pane in the 4-view layout).
  - Renderer throws at start.
  - Context lost while in use.
  - Five rounds of switching between 2D and 3D.
- Not tested: a failing decor model file in the 3D view.

**2. Capacity feedback** (`lib/capacity.ts`)
- Zones are clipped to the venue.
- Stage, FOH and facility areas are removed.
- Overlapping zones are counted once, at the lower density.
- Table seats are counted exactly, never alongside the seating zone they sit in.
- The status is ok, unverified or unknown, and the wording says it is not a licensed capacity.
- Issues link to their zone.
- Used by the HUD, Ground plan, warnings, Safety tab and PDF.

**3. Weight and power definitions** (`lib/loads.ts`)
- One `loadSummary` is used by the HUD, Deliver, the PDF and the CSV.
- Weight is total equipment, split into truss-supported and ground-supported.
- Power is the continuous maximum, with LED maximum and average shown.
- Hoist motors are listed separately as intermittent.
- Unverified items are named rather than guessed.
- The CSV has unit and row columns plus a totals block. A test checks that the rows add up to the totals.

**4. Recoverable changes** (`store.ts`, `library.ts`)
- **Save status:** Saving, Saved on this device, Saved to cloud, Offline (retries on reconnect), or Save failed with "Save a copy as a file".
- **Closing the tab:** the last edit is saved immediately.
- **Undo:** one step per slider drag or typing burst; opening another project clears history; undo clears a stale selection.
- **Damaged saves:** kept aside instead of lost.

**4. Recoverable changes: still partial**
- Old, partial and imported projects now pass through `normalizeProject` (`lib/migrate.ts`), and files from a newer app version are refused with a clear message. **Done**, 3 tests.
- There is no conflict handling for cloud saves.
- The generator plan still uses its own stated diversity factors. They are labelled there, but not yet shown alongside the shared totals.

## Priority 2: accessibility and usability. Done for the items below

- **Shared accessible dialog** (`useDialog` in `components/ui.tsx`), used by every Modal and the venue library. Verified in the browser on the feedback form:
  - Focus moves to the first field.
  - Tab and Shift+Tab wrap inside the dialog.
  - The page behind is inert.
  - Escape closes it and focus returns to the trigger.
- **Text contrast:** muted text is `#858585` on dark and `#666666` on light, 4.5:1 or better on the panels (it was 3.94:1). Canvas labels are updated to match.
- **Reduced motion:** honoured by CSS animations, and the 3D view starts without auto-orbit or moving lights when the system asks for reduced motion.
- **Tips:** they fold into a small "How this works" tab after "Got it". The choice is remembered and the tips can be reopened.
- **Not done:** a full audit of names on icon-only buttons, and touch-target sizes.

## Priority 3: editor organisation and precise editing. Partial (from earlier work)

- **Already done:**
  - Shift+click multi-select.
  - Align, distribute, level and stack.
  - Smart snap with guides.
  - Grid, floor and stage-top snapping.
  - Numeric fields in property panels.
- **Not started:**
  - Box select.
  - A layer list for all workspaces (the Model tab has one).
  - Isolate.
  - Lock and hide outside the Model tab.
  - Feet input.
  - Cross-workspace groups.
  - Linked instances.

## Priority 4: custom modelling. Partial (3D Model tab already exists)

- **Already in the Model tab:**
  - Primitives: box, cylinder, sphere, dome, cone, ring and arch, plane, stairs, ramp.
  - Spin and extrude.
  - Bevel.
  - Arrays and mirror.
  - Groups.
  - Ready-made pieces: staircase, colonnade, podium, chandelier, portal, pavilion.
  - .glb export.
- **Not started:**
  - Boolean cut-outs.
  - Real 3D text.
  - Paths and sweeps.
  - Converting set pieces into parts.

## Priority 7: revisions. Partial

- **Save points** (File → Save points…): named versions with notes, stored per project on this device. Verified in the browser and covered by 2 tests.
  - Restoring first saves the current state as a point, and the restore can be undone.
- **Duplicate:** now "Duplicate as a new option", which makes a separate project named "(option B)".
- **Not done:** approval locking, and showing the revision in client links.

## Priority 8: quotations. Partial

- **Markup:** "Markup on rates" shows its gross-margin equivalent.
- **Unpriced rows:** shown as Unpriced, counted, and left out of the total.
- **Calculation order** is stated in the app and on the PDF.
- **Quote details:** number, revision, valid-until date, and draft/sent/approved status, all in the app and on the PDF.
- **Input limits:** discount 0–100% and no negative extras. 1 test.
- **Not done:** checking every export format's file structure.

## Priorities 5, 6, 9 and 10. Not started

Judged lower value for now, or blocked: MVR/GDTF export, a full editor restructure, path sweeps, and a performance test suite.

Assets, materials and branding; event-specific intelligence; presentation and revisions; quotations and export validation; onboarding and newsletter; responsiveness and performance.

## External dependencies

- **Supabase migration `20261117000000_newsletter_testimonials.sql`:** not applied, so the newsletter and feedback forms say "not connected".
- **Privacy and terms pages:** need reviewed content.
- **Email-sending provider:** none for the newsletter.
