import { describe, expect, it } from 'vitest'
import { fxActive, hitAt, lightsAt, newCue, quickShow, screensAt, snapTime, tapTempo } from './show'
import type { Show } from '../types'

const show = (cues: Show['cues']): Show => ({ cues, length: 120, bpm: 120 })

describe('show playback', () => {
  it('lights hold until the next lights cue; strobe only during its own length', () => {
    const s = show([newCue('lights', 0, { palette: 'ice', move: 'still', level: 0.5 }), newCue('lights', 10, { palette: 'duo', move: 'fast', strobe: true, dur: 2 })])
    expect(lightsAt(s, -1)).toBeNull()
    expect(lightsAt(s, 5)).toMatchObject({ palette: 'ice', speed: 0, level: 0.5, strobe: false })
    expect(lightsAt(s, 11)).toMatchObject({ palette: 'duo', speed: 2.2, strobe: true })
    expect(lightsAt(s, 30)).toMatchObject({ palette: 'duo', strobe: false })
  })

  it('screens: a flash fades over its cue, black and tint hold', () => {
    const s = show([newCue('screens', 0, { screen: 'black' }), newCue('screens', 4, { screen: 'flash', dur: 2 }), newCue('screens', 8, { screen: 'tint', color: '#ff0000' })])
    expect(screensAt(s, 1)?.mode).toBe('black')
    expect(screensAt(s, 4)?.flash).toBeCloseTo(1)
    expect(screensAt(s, 5)?.flash).toBeCloseTo(0.5)
    expect(screensAt(s, 7)?.flash).toBe(0)
    expect(screensAt(s, 9)).toMatchObject({ mode: 'tint', color: '#ff0000' })
  })

  it('effects fire only during their cue; "Everything" fires them all', () => {
    const s = show([newCue('fx', 5, { fx: 'cold-pyro', dur: 2 }), newCue('fx', 20, { fx: 'all', dur: 1 })])
    expect(fxActive(s, 4.9, 'cold-pyro')).toBe(false)
    expect(fxActive(s, 6, 'cold-pyro')).toBe(true)
    expect(fxActive(s, 7.1, 'cold-pyro')).toBe(false)
    expect(fxActive(s, 6, 'confetti')).toBe(false)
    expect(fxActive(s, 20.5, 'confetti')).toBe(true)
    expect(hitAt(s, 20.5)).toBeGreaterThanOrEqual(0)
  })

  it('snaps to the beat and reads tap tempo', () => {
    expect(snapTime(1.3, 120)).toBeCloseTo(1.5)
    expect(snapTime(1.3, 120, 2)).toBeCloseTo(1.25)
    expect(tapTempo([0, 0.5, 1, 1.5, 2])).toBeCloseTo(120)
    expect(tapTempo([0, 0.5])).toBeNull()
  })

  it('quick show fits the track, is sorted, and has a drop with pyro', () => {
    const cues = quickShow(180, 128)
    expect(cues.length).toBeGreaterThan(10)
    expect(cues.every((c, i) => i === 0 || c.t >= cues[i - 1].t)).toBe(true)
    expect(cues.every((c) => c.t <= 180)).toBe(true)
    expect(cues.some((c) => c.fx === 'cold-pyro')).toBe(true)
    // Short tracks still get a sensible show.
    const short = quickShow(30, 120)
    expect(short.every((c) => c.t + c.dur <= 30.001)).toBe(true)
    expect(short.find((c) => c.fx === 'cold-pyro')!.t).toBeLessThan(12)
  })
})
