import type { Metrics } from '../types'

export const getChartData = (metrics: Metrics) => [
  { name: 'Signals', value: metrics.totalSignals },
  { name: 'Anomalies', value: metrics.anomaliesDetected },
  { name: 'Actions', value: metrics.actionsTaken }
]

export const getPerformanceScore = (metrics: Metrics) =>
  Math.round((metrics.actionsTaken / metrics.totalSignals) * 100)
