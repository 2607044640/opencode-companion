import type { RubberBandBox } from "../groups/group-commands"

export type BandPoint = {
  readonly x: number
  readonly y: number
}

export type RubberBand = {
  readonly start: BandPoint
  readonly end: BandPoint
}

export function rubberBandBox(band: RubberBand): RubberBandBox {
  return {
    x: band.start.x,
    y: band.start.y,
    w: band.end.x - band.start.x,
    h: band.end.y - band.start.y,
  }
}

export function rubberBandOverlayStyle(band: RubberBand): {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
} {
  return {
    left: Math.min(band.start.x, band.end.x),
    top: Math.min(band.start.y, band.end.y),
    width: Math.abs(band.end.x - band.start.x),
    height: Math.abs(band.end.y - band.start.y),
  }
}

export function shouldStartRubberBand(input: {
  readonly ctrlKey: boolean
  readonly button: number
  readonly onNode: boolean
}): boolean {
  return input.ctrlKey && input.button === 0 && !input.onNode
}
