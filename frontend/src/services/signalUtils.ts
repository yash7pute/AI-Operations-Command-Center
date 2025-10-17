import type { Signal } from '../types'

export const formatSignalTimestamp = (ts: number) =>
  new Date(ts).toLocaleString()

export const replaySignal = (signal: Signal) => {
  console.log(`Replaying signal ${signal.id}`)
}
