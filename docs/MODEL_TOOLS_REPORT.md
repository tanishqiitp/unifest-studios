# 3D Model tools: overnight build report

**Branch:** `festival-builder`.
**Preview:** https://unifest-studios-git-festival-builder-tanishq10.vercel.app (sign in to Vercel if it asks).
**Live site:** unchanged. Nothing here is merged into `main`.

## How to try it
1. Open the 3D Model tab.
2. Under **Ready-made**, add **Floral Mandap**, **Celestial Crown** or **Festival stage**.
3. Click any part to see its controls on the right.

## New tools

| Tool | Where | What it does |
|---|---|---|
| **Sculpt clay** | Add → Advanced → Sculpt clay, then **Turn on Sculpt mode** | Brushes like Blender: Draw, Inflate, Smooth, Grab, Flatten, Pinch. See the notes below the table. |
| **Cut-outs** | Box or Extrude shape → Shape → Cut-outs | Windows, arched openings, portholes or diamond lattice, as a grid. Any opening that would cross the edge is left out. |
| **Curve** | Add → Advanced → Curve | Tube (pipes, neon lines), ribbon, or a curved wall when drawn in the top view. Drag its points; it can be a closed loop. "Repeat a part along this curve" lines copies up along it, turned to follow the line. |
| **Drape / swag** | Add → Stage → Drape / swag | Fabric with folds; Swags scallops the top edge. No physics, so it's light. |
| **Scatter** | Any part → "Scatter flowers on this surface", or Array → "Scattered over its parent" | Up to 1,500 copies over a surface, drawn as one batch. Settings: size variation, random turn, pattern number. |
| **Cage deform** | Shape → Cage deform… | A 3×3 grid of handles in front and side views bends the whole shape. Presets: Bulge, Pinch, Flare, Lean, S-curve, Wave. |
| **3D text** | Text sign → "3D letters (extruded)" | Solid letters with depth and rounded edges. The font loads only when used and falls back to the flat sign if offline. |
| **Taper / Twist / Bend / Sculpt %** | Shape panel | Applied when the shape is built, so they stay editable. |
| **Render** | Model toolbar | HD, 4K or square PNG with soft shadows and smooth edges. Grid, outlines and handles are hidden. An HD render takes about a second. |
| **Views** | Model toolbar | Save the current camera with a name and jump back later. Stored in the project. |
| **Person for scale** | Model toolbar (person icon) | A 1.75 m figure at the stage front, also shown in renders. |

**Sculpt clay details:**
- Ctrl inverts a brush (carve, shrink, spread) and Shift smooths.
- Mirror left and right is on by default.
- `[` and `]` change the brush size.
- Each stroke is one undo step.
- Detail: Low, Medium or High, up to about 42,000 points.
- Starting shape: ball, block or relief panel.

## Showcases
- **Floral Mandap** uses most of the new tools together:
  - tiered podium;
  - turned gold pillars flared by the cage;
  - swag drapes on four sides;
  - a canopy covered with about 420 flowers;
  - a curved floral arch;
  - a cut-out gold lattice;
  - 3D "A & R" lettering.
- **Celestial Crown** is a sculptural centrepiece:
  - sculpted LED orb;
  - halos;
  - twisted spires;
  - feathered wings;
  - bent ribbon arches.
- **Festival stage**: centre LED in three nested arches, wings with rising fins, angled towers. It fits itself to your existing stage.

## Speed (measured on this machine, Chrome, dev build)
- **First page load:** about **493 KB** of JavaScript (gzip), against **750 KB** on the live site. The CAD 3D pane now loads only when someone opens a 3D view, so the site got lighter even with all the new tools.
- **Sculpting:**
  - Shading is updated only around the brush. A test checks it matches a full recompute within 0.0001.
  - A 42,000-point mesh takes about 6–7 ms per frame (median); the first dab takes about 25 ms while it builds lookup tables.
- **Scatter:**
  - Small scattered copies use lighter geometry. The mandap scene went from about 850,000 to about 250,000 triangles in the 3D Visualizer.
  - All copies are drawn as one batch.
- **Still render:** HD with 16 passes in about 0.8 s. Nothing runs per frame.
- **Modifiers:** applied once per edit, never per frame.

## Bugs found and fixed along the way
- Gold, chrome and steel rendered almost black in the 3D Model view and the CAD 3D panes. A soft studio reflection map is now computed once.
- Open ribbons and curved walls joined their two ends with a stray straight segment.
- Dragging handles in the cage, curve and outline editors created one undo step per tiny movement. Now one press is one undo step everywhere.
- Store selectors returned a fresh empty list (`?? []`), which could freeze a view in an endless re-render. This affected Model saved views and Set Design on projects with no set pieces.
- `newPart` defaults for curves were overwritten by later fields.

## Checks run
- **Tests:** 147 automated tests pass. New tests cover sculpt storage, brushes, the fast normals, cut-outs, curves, ribbon ends, cage, drapes, the assemblies and arrays.
- **Type check and build:** type check and production build are clean.
- **Browser (dev build):**
  - every section opens with no errors;
  - all six brushes plus Ctrl-carve change the shape and save one undo step each;
  - cut-outs, curves with fins, drape swags, flower scatter, the bulge and S-curve cage presets and the 3D letters all checked from several camera angles;
  - HD render and its clean-up;
  - saving and recalling a view;
  - the person toggle;
  - phone layout with no sideways overflow;
  - .glb export with all new types (about 1.8 MB for the mandap scene);
  - the 3D Visualizer showing the mandap.
- **Share links:** links packed into the address leave out sculpt data, which is too large for an address. Short links keep it.

## Known limits
- **Sculpting:** brushes work on a fixed point density (no dynamic topology or multires like Blender). Grab with a big pull can make sharp spikes; use Smooth after.
- **Saved sculpt size:** a High-detail sculpt saves about 330 KB. Several of them in one project can fill the browser's local storage (about 5 MB). The footer then shows "Save failed" with "Save a copy as a file".
- **Scatter:** copies use one colour; the "alternate colour" option applies to rows and circles, not scatter.
- **Cut-outs:** openings are a grid pattern, not freely drawn holes.
- **3D text:** uses one typeface (Droid Sans Bold, Apache-2.0) from the jsDelivr CDN.
- **Render:** has no ambient occlusion yet.
- **Separate branch:** the earlier `smart-edit` work (on-canvas action bar, one-click warning fixes, fitting screens and truss to the stage) is still separate, with one test to finish.
