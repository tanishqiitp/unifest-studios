# Unifest Studios: build plan (v0.1 MVP)

Spec: `unifest-studio-prompt.md`. Reference product: ledmapper.pro.

## Open-source building blocks
| Need | Library | Why |
|---|---|---|
| 2D editors (ground, stage, truss, LED) | `konva` + `react-konva` | Fast canvas, drag/transform, 1000s of shapes |
| 3D visualizer | `three` + `@react-three/fiber` + `@react-three/drei` | Declarative three.js, orbit controls, helpers |
| State + undo/redo | `zustand` + `zundo` | Single store shared by 2D and 3D, temporal history |
| DXF export (1:1) | `dxf-writer` | MIT, layers, lines/polylines/text |
| PDF reports | `jspdf` + `jspdf-autotable` | Vector drawing + tables in the browser |
| Share link QR | `qrcode` | QR as data URL |
| Share link payload | `lz-string` | Compress project into URL hash (no backend) |
| Icons / styling | `lucide-react`, Tailwind v4 | Monochrome thin icons, utility CSS |

No complete open-source truss/LED planner exists. The calculations in `src/lib/calc.ts` are written from scratch.
- Pixel-map ideas came from NLED Pixel Mapper and WLED ledmap generators.
- The Resolume XML format is undocumented. It is a best-effort export, based on the community reverse-engineering in the ResToAE and stoatworks docs, and is marked *beta*.

## Architecture
- One project model (metres) in `src/store.ts`, with save to localStorage, `.unifest` JSON file and a share link.
- Coordinates:
  - Top view: x is across the venue and y is depth (the stage is near y = 0).
  - Screens add a z bottom elevation and an optional rotation.
- `src/lib/panels.ts`: panel library. `src/lib/calc.ts`: pixels, area, weight, power, circuits, phases, ports, truss loads, capacity. `src/lib/warnings.ts`: plain-English checks.
- Workspaces: `src/workspaces/{Ground,Stage,Truss,Led,Viz3D,Deliver}.tsx`.
- Exports in `src/lib/export/*`: pixel map PNG, technical PDF, DXF, Resolume XML, CSV, project file.
- `#view=` share route: a read-only 3D client view.

## Phases (this build)
1. Shell, design system, store, save/load, HUD, warnings drawer, Simple/Pro toggle
2. LED workspace (panel library, px/m/panels sizing, add-adjacent, clone, mirror, live symmetry, paint-virtual, wiring and power overlays)
3. Ground plan + Stage + Truss & rigging (loads)
4. 3D visualizer
5. Deliver: exports + share link + QR
6. New-event wizard + templates

## Later
- Supabase auth/cloud
- Video walkthrough export
- NDI/DMX
- Site-plan PDF tracing (image tracing is in v0.1)
- Collaborative comments
