// All distances are metres, weights kg, power watts.
// Top view: x runs across the venue, y runs from the back of the stage (0) towards the audience.

export type Workspace = 'ground' | 'stage' | 'truss' | 'led' | 'seating' | 'viz' | 'deliver'
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
}
