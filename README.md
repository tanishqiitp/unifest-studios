# Unifest Studios

Design the technical layout of a live event (ground plan, stage, truss and rigging, LED screens), see it in 3D, and export crew-ready files.

## Run it
```bash
npm install
npm run dev
```
Open http://localhost:5173 on a desktop browser at least 1024 px wide.

`npm run build` writes a static site to `dist/`. It can be hosted anywhere (Vercel, Netlify, any static host). Share links only work for other people once the app is hosted.

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
   - Built live from the 2D plans.
   - Camera presets, day/night, light beams.
   - Play your own video or image on the screens; PNG render.
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
- `src/workspaces/*`: one file per workspace. `src/components/PlanCanvas.tsx` is the shared pan/zoom/measure canvas.

## Accuracy notes
- Panel specs are typical rental values. Add exact models under "My panels".
- Truss limits use an indicative load table and a uniform-load approximation. A certified rigger must verify every load.
- Resolume's XML format is undocumented. Load the preset in Arena and check it before the show.
