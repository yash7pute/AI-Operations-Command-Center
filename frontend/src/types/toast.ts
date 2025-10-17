/**
 * Toast Notification Types
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  message: string
  title?: string
  duration?: number
  dismissible?: boolean
  timestamp: string
}

export interface ToastOptions {
  type?: ToastType
  title?: string
  duration?: number
  dismissible?: boolean
}
