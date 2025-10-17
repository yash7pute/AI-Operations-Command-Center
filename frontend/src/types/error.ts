export interface ErrorEntry {
  id: string
  timestamp: string
  component: string
  message: string
  severity: 'error' | 'warning'
  stack?: string
}
