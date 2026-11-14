// All distances are metres, weights kg, power watts.
// Top view: x runs across the venue, y runs from the back of the stage (0) towards the audience.

export type Workspace = 'ground' | 'stage' | 'truss' | 'led' | 'seating' | 'decor' | 'viz' | 'plan' | 'deliver'
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
}

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
