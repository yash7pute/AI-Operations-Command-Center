export interface Metrics {
  signalsToday: number
  tasksCreated: number
  successRate: number
  avgTime: number
  pendingApprovals: number
  queueDepth: number
  urgencyBreakdown: { label: string; value: number }[]
  categoryDistribution: { category: string; count: number }[]
  confidenceHistogram: { bucket: string; count: number }[]
  accuracyOverTime: { time: string; accuracy: number }[]
  actionsByPlatform: { platform: string; value: number }[]
  topPatterns: string[]
  accuracyDelta: number
  config?: Config
  errors?: ErrorEntry[]
  activity?: Activity[]
}
