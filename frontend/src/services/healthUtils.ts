import type { ErrorEntry } from '../types'

interface HealthStatus {
  uptime: number
  errors: ErrorEntry[]
}

export const getSystemHealth = (status: HealthStatus) =>
  status.uptime > 99 && status.errors.length === 0 ? 'healthy' : 'degraded'

export const filterErrors = (logs: ErrorEntry[], level: string) =>
  logs.filter(log => log.severity === level)
