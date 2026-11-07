# Unifest Studios

Design the technical layout of a live event (ground plan, stage, truss and rigging, LED screens), see it in 3D, and export crew-ready files.

## Run it
```bash
npm install
npm run dev
```
Open http://localhost:5173 on a desktop browser at least 1024 px wide.

- `npm test` runs the automated checks (LED, power, rigging, templates, share links, exports, project library).
- `npm run build` writes a static site to `dist/`.

## Put it online
Share links and QR codes only work for other people once the app is hosted. It is a static site, so any static host works:
- **Vercel or Netlify:** push this folder to GitHub, import the repository, and accept the defaults (`vercel.json` / `netlify.toml` are included).
- **Anywhere else:** upload the contents of `dist/`.

`.github/workflows/ci.yml` runs the tests and build on every push.

## Accounts and cloud saving (Supabase)
- Sign in with an emailed link (no password). Signed-in projects save to the cloud a moment after each edit and appear on any device; projects already in a browser can be uploaded from the home screen. The app still works fully without an account.
- Signed-in users get short client links (`/s/<code>`) that always show the latest saved design.
- Database: `supabase/migrations/` (tables `projects` and `shares`, owner-only row-level security; share links open only by exact code through `get_share`). Auth URLs: `supabase/config.toml` (`supabase config push`).
- Settings: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (see `.env.example`; already set on Vercel). Without them the app runs browser-only.
- `.github/workflows/keep-awake.yml` pings the database every 3 days so the free project never pauses.
- Supabase's built-in email sender only allows a few sign-in emails per hour. Before launch, connect a free SMTP service (for example Resend) under Authentication → SMTP Settings.

## Getting around
- The **home screen** lists your saved projects (open, open in 3D, duplicate, delete) and the templates. Click the logo to return to it.
- Each workspace shows a short **guide** with a button to the next step. The **?** button in the top bar brings it back.

## Workspaces (keys 1–6)
1. **Ground Plan**:
   - Venue size and site-image tracing.
   - Zones: crowd, seating, VIP, FOH, barricade, exits, delay towers and more.
   - Capacity calculation and screen sightlines.
2. **Stage**:
   - Deck builder (2×1 m, 1×1 m, 8×4 ft).
   - End, thrust, T, runway and centre presets.
   - DJ and drum risers and a podium.
3. **Truss & Rigging**:
   - Draw truss runs, place chain hoists and hang lights or PA.
   - Live kg per point and span checks.
   - **Auto-rig** places hoists for you.
4. **LED Screens**:
   - Panel library plus your own panels.
   - Size by pixels, metres or panel count.
   - Add adjacent screens with the + handles; clone, copy and paste properties.
   - **Live symmetry**, **Paint** for empty panels, and curved screens.
   - Pro mode: data-port snake and 3-phase power plan.
5. **3D Visualizer**:
   - Built live from the 2D plans: aluminium truss with real lattice, chain hoists, J-curve line arrays, stacked subs, moving heads, FOH tent, gates and a crowd that moves.
   - Three looks: **Night show** (bloom, haze, moving beams with floor hits, screen glow lighting the stage, reflective floor, 5 colour palettes), **Daylight** (sky, sun shadows) and **Technical** (clean model with dimension labels).
   - Six camera presets with smooth moves, plus **Showcase** auto-orbit.
   - Click any screen, truss or the stage for its specs.
   - Play your own video or image on the screens.
   - **Render** a high-resolution PNG (up to 4K wide) and record a **walkthrough video**: 16:9 (1920×1080) or 9:16 social reel (1080×1920), MP4 in Chrome/Edge, WebM elsewhere.
6. **Deliver**:
   - Client 3D share link with QR and WhatsApp share.
   - Technical PDF pack, 1:1 DXF and native pixel-map PNG.
   - Resolume 6/7 XML (beta), equipment CSV and the `.unifest` project file.

Simple/Pro mode is switched in the top bar. Projects autosave in the browser; use File → Open or the Deliver page to move `.unifest` files between machines.

## Code map
- `src/types.ts`: project model (metres, kg, W).
- `src/store.ts`: Zustand store with undo/redo (zundo), autosave and live-symmetry sync.
- `src/lib/calc.ts`:
  - Pixels, area, weight and power.
  - Cable order, ports, circuits and phase balance.
  - Rigging loads and the auto-rig solver.
  - Capacity.
- `src/lib/warnings.ts`: plain-English checks shown in the bottom bar.
- `src/lib/templates.ts`: new-event wizard and the 7 templates.
- `src/lib/export/*`: PDF, DXF, PNG, Resolume XML, CSV and the share link.
- `src/lib/library.ts`: saved-projects library in the browser (migrates v0.1's single save).
- `src/lib/__tests__/*`: Vitest tests.
- `src/components/Home.tsx`, `Guide.tsx`: home screen and workspace guides.
- `src/workspaces/*`: one file per workspace. `src/components/PlanCanvas.tsx` is the shared pan/zoom/measure canvas.

## Accuracy notes
- Panel specs are typical rental values. Add exact models under "My panels".
- Truss limits use an indicative load table and a uniform-load approximation. A certified rigger must verify every load.
- Resolume's XML format is undocumented. Load the preset in Arena and check it before the show.
