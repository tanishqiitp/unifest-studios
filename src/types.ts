// All distances are metres, weights kg, power watts.
// Top view: x runs across the venue, y runs from the back of the stage (0) towards the audience.

export type Workspace = 'ground' | 'stage' | 'set' | 'truss' | 'led' | 'seating' | 'decor' | 'model' | 'viz' | 'plan' | 'deliver'
export type Mode = 'simple' | 'pro'
export type Units = 'm' | 'ft'

export interface Panel {
  id: string
  brand: string
  model: string
  pitch: number // mm
  w: number // cabinet mm
  h: number // cabinet mm
  pxW: number
  pxH: number
  weight: number // kg per cabinet
  maxW: number
  avgW: number
  viewAngle: number
  outdoor: boolean
  custom?: boolean
}

export type ScreenShape = 'flat' | 'concave' | 'convex'
export type CablePath = 'S-row' | 'S-col'
export type StartCorner = 'tl' | 'tr' | 'bl' | 'br'

export interface Screen {
  id: string
  name: string
  panelId: string
  cols: number
  rows: number
  virtual: number[] // cell indices (row * cols + col) marked empty
  x: number // left edge, top view
  y: number // depth plane the screen sits on
  z: number // bottom elevation
  rotation: number // degrees around vertical axis
  shape: ScreenShape
  curveDeg: number // angle between adjacent columns when curved
  mount: 'flown' | 'ground'
  color: string
  mirrorOf?: string // live symmetry: this screen mirrors another
  image?: string // data URL shown on the screen in 3D
  video?: string // http(s) video URL played on the screen in 3D
  tilt?: number // degrees, forward lean (+ tips the top towards the audience)
  brightness?: number // 0.2–2, multiplies the glow in 3D
  frame?: 'none' | 'black' | 'silver' | 'brand' // border around the screen
}

export type GroundKind =
  | 'crowd'
  | 'seating'
  | 'vip'
  | 'foh'
  | 'barricade'
  | 'entry'
  | 'exit'
  | 'delay'
  | 'camera'
  | 'generator'
  | 'greenroom'
  | 'washroom'
  | 'food'
  | 'label'

export interface GroundItem {
  id: string
  kind: GroundKind
  x: number
  y: number
  w: number
  h: number
  rotation: number
  label: string
}

export interface Deck {
  id: string
  x: number
  y: number
  w: number
  l: number
  h: number
  color?: string // deck top colour
  skirt?: string // skirt colour
  edgeLight?: boolean // LED strip along the front edge (default on)
}

export type TrussType = 'box30' | 'box40' | 'tri30'

export interface Truss {
  id: string
  type: TrussType
  x1: number
  y1: number
  x2: number
  y2: number
  height: number // trim height
  legs: boolean // ground-support towers at both ends
  finish?: 'silver' | 'black' | 'white'
}

export interface Hoist {
  id: string
  x: number
  y: number
  capacity: number // kg
}

export type FixtureKind = 'moving-head' | 'par' | 'beam' | 'blinder' | 'line-array' | 'sub'

export interface Fixture {
  id: string
  kind: FixtureKind
  x: number
  y: number
  z: number
  // Optional aim and look; when absent the 3D view animates the light automatically.
  aim?: 'auto' | 'fixed'
  pan?: number // degrees, 0 = towards the audience, + = to stage-left (audience right)
  tilt?: number // degrees from straight down (0) to horizontal (90)
  beam?: number // full beam angle in degrees
  reach?: number // maximum throw in metres
  color?: string // hex; empty = follow the show palette
  intensity?: number // 0–1
}

// Decor, special effects and branding placed around the venue.
export type DecorKind =
  | 'mandap'
  | 'floral-arch'
  | 'flower-wall'
  | 'drape'
  | 'pillar'
  | 'chandelier'
  | 'centrepiece'
  | 'photo-booth'
  | 'entrance-gate'
  | 'cold-pyro'
  | 'smoke'
  | 'co2-jet'
  | 'confetti'
  | 'flame'
  | 'firework'
  | 'bubble'
  | 'banner'
  | 'standee'
  | 'flag'
  | 'backdrop'
  | 'model' // imported 3D model (Blender, glTF)

export interface Decor {
  id: string
  kind: DecorKind
  x: number
  y: number
  z: number // base elevation
  w: number // across
  d: number // depth
  h: number // height
  rotation: number // degrees
  color: string
  label: string
  image?: string // data URL: logo or artwork (banners, standees, flags, backdrops)
  sponsor?: string // sponsor or brand name
  modelId?: string // for kind 'model': key of the file in this browser's model store
  intensity?: number // effects: 0–1
  fire?: boolean // effects: firing in the 3D preview
  // Imported models
  tint?: boolean // paint the whole model in `color`
  wire?: boolean // show as wireframe
  proxy?: boolean // show only a box (for very heavy models)
  hidden?: string[] // names of model parts switched off
  preset?: string // added by a ready-made arrangement (re-applying it replaces these)
}

// Scenic set pieces, designed in the front view (Set Design workspace).
export type SetKind = 'tower' | 'block' | 'frame' | 'arch' | 'ring' | 'pod' | 'booth' | 'scaffold' | 'cutout' | 'tent' | 'stall' | 'balloon' | 'logo' | 'shape' | 'line'
export type Skin = 'led' | 'print' | 'fabric' | 'mirror' | 'gold' | 'wood' | 'black' | 'white' | 'paint'

export interface SetPiece {
  id: string
  kind: SetKind
  x: number // centre across the venue
  y: number // depth: distance from the back of the venue (top view)
  z: number // bottom elevation
  w: number
  h: number
  d: number // depth of the piece
  skin: Skin
  color: string // paint / fabric / print base colour
  label: string
  image?: string // artwork, cut-out PNG or logo (data URL)
  border?: number // frames, arches and rings: thickness of the frame in metres
  inner?: Skin | 'open' // what fills a frame, arch or ring opening
  outline?: { style: 'bulb' | 'neon'; color: string; chase: boolean }
  mirrorOf?: string // live mirror of another piece across the centre line
  rot?: number // turn in the top view, degrees
  // Drawn pieces ('shape' and 'line'): a sketch on one plane, pushed out through the third axis.
  plane?: SketchPlane
  pts?: [number, number][] // sketch points as 0..1 of the plane size; v runs up (front, side) or towards the audience (top)
}

// front: across x up, pushed back by the depth. top: across x depth, pushed up by the height. side: depth x up, pushed across by the width.
export type SketchPlane = 'front' | 'top' | 'side'

export interface Brand {
  name: string
  logo?: string // data URL
  color: string
}

// Commercials: rates and tax for the quotation.
export interface QuoteSettings {
  client: string
  clientGstin: string
  companyGstin: string
  sameState: boolean // CGST + SGST when true, IGST when false
  gstRate: number // percent, default 18
  margin: number // percent added on rates
  discount: number // percent off the subtotal
  days: number // rental days
  rates: Record<string, number> // INR per unit per day, keyed by item name
  extras: { id: string; item: string; qty: number; unit: string; rate: number }[]
  number?: string // quotation reference, e.g. Q-20261118-AB12
  revision?: number // 1, 2, 3… bumped by the user when the client asks for changes
  validDays?: number // days the quotation stays valid (default 15)
  status?: 'draft' | 'sent' | 'approved'
}

export interface Cue {
  id: string
  time: string // HH:MM
  minutes: number
  title: string
  owner: string
  av: string // audio, video, light notes
  notes: string
}

export interface CrewMember {
  id: string
  name: string
  role: string
  phone: string
  call: string // call time HH:MM
  dept: 'Production' | 'LED' | 'Lighting' | 'Sound' | 'Rigging' | 'Stage' | 'Decor' | 'Power' | 'Other'
}

export interface Comment {
  id: string
  x: number
  y: number
  text: string
  author: string
  at: number
  resolved?: boolean
  fromClient?: boolean
}

export interface Approval {
  status: 'pending' | 'approved' | 'changes'
  by: string
  note: string
  at: number
}

export interface ChecklistState {
  state: string // Indian state code for the permit checklist
  done: string[] // checklist item ids ticked
}

// Seating: tables and other furniture, positioned by their centre in the top view.
export type TableKind = 'round' | 'banquet' | 'cocktail' | 'sweetheart' | 'row' | 'classroom' | 'lounge' | 'dance' | 'buffet' | 'bar'

export interface Table {
  id: string
  kind: TableKind
  x: number
  y: number
  w: number // across; diameter for round and cocktail tables
  l: number // depth
  rotation: number // degrees
  seats: number
  label: string
  open?: boolean // round table with the stage-facing side left empty (cabaret)
}

export type Meal = 'veg' | 'non-veg' | 'jain' | 'vegan' | 'kids'

export interface Guest {
  id: string
  name: string
  group: string
  meal: Meal
  vip: boolean
  tableId?: string
}

export interface Project {
  version: 1
  id?: string // set when the project is stored in this browser's library
  name: string
  eventType: string
  units: Units
  venue: { w: number; l: number; image?: string; imageScale?: number }
  audience: number
  screens: Screen[]
  ground: GroundItem[]
  decks: Deck[]
  truss: Truss[]
  hoists: Hoist[]
  fixtures: Fixture[]
  tables: Table[]
  guests: Guest[]
  customPanels: Panel[]
  processor: { portPx: number; name: string }
  circuitAmps: 16 | 32
  updatedAt: number
  // Added in v0.3; older projects may not have them.
  decor?: Decor[]
  set?: SetPiece[]
  parts?: Part[] // free 3D parts from the Model workspace
  views?: SavedView[] // named camera positions in the Model workspace
  setContent?: string // image (data URL) or video link spread across all LED skins
  brand?: Brand
  quote?: QuoteSettings
  cues?: Cue[]
  crew?: CrewMember[]
  comments?: Comment[]
  approval?: Approval
  checklist?: ChecklistState
  eventDate?: string // YYYY-MM-DD
  eventDays?: number
  look?: { haze?: number } // 3D atmosphere
}

// ---------- Model workspace: free 3D parts (Blender-style) ----------
// Venue axes: x across, y depth (towards the audience), z up. Geometry origin is the bottom centre.
export type PartKind = 'group' | 'box' | 'cylinder' | 'sphere' | 'dome' | 'cone' | 'torus' | 'plane' | 'stairs' | 'ramp' | 'lathe' | 'extrude' | 'text' | 'sculpt' | 'path' | 'drape' | 'geodome' | 'truss' | 'helix' | 'tree' | 'mesh'
export type Vec3 = [number, number, number]
export interface SavedView {
  id: string
  name: string
  pos: Vec3 // three.js coordinates
  target: Vec3
}
export interface Cutouts {
  shape: 'circle' | 'square' | 'arch' | 'diamond'
  cols: number
  rows: number
  size: number // 0.1..0.95 of each cell
}
export interface PartMat {
  color: string
  metal: number // 0..1
  rough: number // 0..1
  glow?: number // emissive strength 0..3, in the part colour
  opacity?: number // 0.05..1
  led?: boolean // shows the set LED content
  map?: string // texture (data URL)
  wire?: boolean
}
export interface PartArray {
  mode: 'linear' | 'radial' | 'path' | 'surface' // path: along the parent curve; surface: scattered over the parent
  count: number
  offset: Vec3 // linear: step between copies (x, y, z metres)
  radius?: number // radial: distance from the centre
  angle?: number // radial: total sweep in degrees (360 = full circle)
  grow?: number // each copy is this much taller than the previous (0.1 = +10%); with symmetric, grows outwards
  turn?: number // each copy turns this many more degrees about the vertical
  symmetric?: boolean // linear: copies spread both ways from the original, mirrored
  alt?: string // every other copy uses this colour
}
export interface Part {
  id: string
  name: string
  kind: PartKind
  parent?: string // id of a group part
  pos: Vec3 // local to the parent group
  rot: Vec3 // degrees about x, y, z
  scl: Vec3
  w: number // size across
  d: number // size in depth
  h: number // size up
  seg?: number // smoothness of round shapes
  bevel?: number // rounded edges, metres
  steps?: number // stairs
  arc?: number // torus / dome sweep, degrees
  thick?: number // torus tube thickness, metres
  profile?: [number, number][] // lathe (radius, height) or extrude (across, up), 0..1 of the size
  text?: string
  taper?: number // top size as a fraction of the bottom (1 = straight, 0.3 = pointed)
  twist?: number // degrees turned from bottom to top
  bend?: number // degrees the width curls into an arc (180 = a standing arch)
  organic?: number // 0..1: smooth sculpted bumps over the surface
  paint?: string // sculpt: painted colour per point (p1:base64 RGB)
  zUp?: boolean // imported file is Z-up (STL, CAD): stood upright when loaded
  modelId?: string // imported 3D file (kind 'mesh'), kept in this browser's model store
  cutter?: boolean // a hole: cut out of the other parts in the same group, not drawn itself
  seed?: number // changes the organic pattern
  base?: 'sphere' | 'panel' | 'block' // sculpt: starting shape
  res?: 'low' | 'medium' | 'high' // sculpt: point density
  sculpt?: string // sculpt: packed positions (see lib/sculpt.ts)
  holes?: Cutouts // openings cut through a box or extruded shape
  plane?: 'front' | 'top' // curve: drawn in the side view (up/across) or the top view (floor plan)
  closed?: boolean // curve: loops back to the start
  form?: 'tube' | 'ribbon' | 'guide' // curve: what is built along it
  swags?: number // drape: scallops along the top (0 = straight curtain)
  sag?: number // drape: how deep the swags dip, 0..0.9 of the drop
  cage?: { front?: number[]; side?: number[] } // cage deform handles (see lib/cage.ts)
  solid?: boolean // text: extruded 3D letters instead of a flat sign
  mat: PartMat
  array?: PartArray
  mirror?: boolean // live copy across the venue centre line (top-level parts)
  hidden?: boolean
  locked?: boolean
}
