import type { Classification } from '../types'

export const getLabelColor = (label: string) => {
  switch (label) {
    case 'normal':
      return 'green'
    case 'anomaly':
      return 'yellow'
    case 'critical':
      return 'red'
    default:
      return 'gray'
  }
}

export const getConfidenceLevel = (confidence: number) => {
  if (confidence > 80) return 'high'
  if (confidence > 50) return 'medium'
  return 'low'
}
