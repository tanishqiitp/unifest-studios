import { useState } from 'react'
import { ArrowRight, Lightbulb, X } from 'lucide-react'
import { useStore } from '../store'
import type { Workspace } from '../types'

const KEY = 'unifest:guides-hidden'

const GUIDES: Partial<Record<Workspace, { title: string; steps: string[]; next?: [Workspace, string] }>> = {
  model: {
    title: 'Model in 3D',
    steps: [
      'Add a shape or a ready-made piece (left). Click it, then drag the arrows: G moves, R rotates, S scales, X/Y/Z locks an axis.',
      'Put parts together with Arrange (right): line up, space evenly, drop onto what is below, stack. Moving snaps to nearby parts (hold Alt to move freely); Ctrl+D repeats your last move on each new copy.',
      'Shape it in the panel on the right: taper, twist, bend, cage deform, cut-outs, or Sculpt clay with brushes (turn on Sculpt mode).',
      'Curves make tubes, ribbons and curved walls; repeat parts along a curve or scatter flowers over any surface.',
      'Save camera views, render a high-quality still, and export a .glb for Blender any time.',
    ],
    next: ['viz', 'See it in the 3D Visualizer'],
  },
  ground: {
    title: 'Plan the ground',
    steps: ['Set the venue size, or upload a site photo to trace over (left panel).', 'Add crowd, FOH, barricade and exits. Drag to move, pull corners to resize.', 'Capacity and sightlines update as you go.'],
    next: ['stage', 'Build the stage'],
  },
  stage: {
    title: 'Build the stage',
    steps: ['Pick a stage preset, or add decks one by one.', 'Add DJ and drum risers on top.', 'Select a deck to change its size and height.'],
    next: ['truss', 'Add truss'],
  },
  truss: {
    title: 'Truss and rigging',
    steps: ['Use a preset or draw truss runs on the plan.', 'Press Auto-rig to place hoists so no point is overloaded.', 'Hang lights and PA on the selected truss.'],
    next: ['led', 'Design LED screens'],
  },
  led: {
    title: 'Design the LED screens',
    steps: ['Add a screen and size it in metres, pixels or panels.', 'Use the + handles to add screens alongside, and Live symmetry for side screens.', 'Switch to Pro (top bar) for data cabling and 3-phase power.'],
    next: ['seating', 'Plan seating'],
  },
  seating: {
    title: 'Tables and seating',
    steps: ['Pick a style (banquet, theatre, classroom…) and press Generate layout, or add tables one by one.', 'Paste your guest list, with meal and group if you have them.', 'Press Auto-seat: VIPs go nearest the stage and groups sit together. Fine-tune from each table.'],
    next: ['viz', 'See it in 3D'],
  },
  viz: {
    title: 'Present in 3D',
    steps: ['Pick a camera, or press Showcase to orbit.', 'Night show adds moving lights; pick a colour palette.', 'Render a still or record a walkthrough video for your client.'],
    next: ['deliver', 'Deliver files'],
  },
}

function readHidden(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    return {}
  }
}

export function Guide() {
  const ws = useStore((s) => s.ui.workspace)
  const forced = useStore((s) => s.ui.guideOpen)
  const { setUI } = useStore.getState()
  const [hidden, setHidden] = useState(readHidden)
  const g = GUIDES[ws]
  if (!g) return null
  const pos = ws === 'viz' ? 'left-4 top-20' : 'left-[272px] bottom-16'
  // Once read, the guide folds into a small tab so it never covers the drawing area.
  if (hidden[ws] && !forced)
    return (
      <button className={`absolute ${ws === 'viz' ? 'left-4 top-20' : 'left-[272px] bottom-16'} z-20 glass rounded-full h-7 px-3 text-[11px] text-dim hover:text-white flex items-center gap-1.5 guide-pill`} onClick={() => setUI({ guideOpen: true })} aria-label={`Show tips: ${g.title}`}>
        <Lightbulb size={12} /> How this works
      </button>
    )
  const close = () => {
    const h = { ...hidden, [ws]: true }
    setHidden(h)
    setUI({ guideOpen: false })
    try {
      localStorage.setItem(KEY, JSON.stringify(h))
    } catch {
      /* fine: the guide just shows again next time */
    }
  }
  return (
    <div className={`absolute ${pos} z-20 w-72 glass guide-card rounded-xl p-4 fade-in shadow-2xl`} role="note">
      <div className="flex items-start gap-2">
        <Lightbulb size={14} className="mt-0.5 shrink-0" />
        <div className="flex-1 text-sm font-semibold">{g.title}</div>
        <button className="text-mute hover:text-white" onClick={close} aria-label="Hide guide">
          <X size={14} />
        </button>
      </div>
      <ol className="mt-2 space-y-1.5">
        {g.steps.map((s, i) => (
          <li key={s} className="flex gap-2 text-[11px] text-dim leading-snug">
            <span className="mono text-mute">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <div className="flex items-center justify-between mt-3">
        <button className="text-[11px] text-mute hover:text-white" onClick={close}>
          Got it
        </button>
        {g.next && (
          <button className="btn h-7 text-[11px]" onClick={() => setUI({ workspace: g.next![0], tool: 'select', guideOpen: false })}>
            {g.next[1]} <ArrowRight size={12} />
          </button>
        )}
      </div>
    </div>
  )
}
