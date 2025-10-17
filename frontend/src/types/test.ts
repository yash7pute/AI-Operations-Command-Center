export interface Toast {
  id: number
  type: 'success' | 'warning' | 'error' | 'info'
  message: string
}
