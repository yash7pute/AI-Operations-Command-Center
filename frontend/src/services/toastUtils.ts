import type { Toast } from '../types'

export const createToast = (type: Toast['type'], message: string): Toast => ({
  id: Date.now(),
  type,
  message
})

export const getToastColor = (type: Toast['type']) => {
  switch (type) {
    case 'success':
      return 'green'
    case 'error':
      return 'red'
    case 'info':
      return 'blue'
    case 'warning':
      return 'yellow'
    default:
      return 'gray'
  }
}
