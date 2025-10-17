import React, { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react'

interface Toast {
  id: number
  type: 'success' | 'warning' | 'error' | 'info'
  message: string
}

const icons = {
  success: <CheckCircle2 className="text-green-500 w-4 h-4" />,
  warning: <AlertTriangle className="text-yellow-500 w-4 h-4" />,
  error: <XCircle className="text-red-500 w-4 h-4" />,
  info: <Info className="text-blue-500 w-4 h-4" />
}

let toastId = 0

export const useToasts = () => {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = (type: Toast['type'], message: string) => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 5000)
  }

  return { toasts, addToast }
}

const ToastNotification = ({ toasts }: { toasts: Toast[] }) => {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.slice(0, 3).map(toast => (
        <div
          key={toast.id}
          className="bg-gray-900 text-white px-4 py-2 rounded shadow flex items-center gap-2"
        >
          {icons[toast.type]}
          <span className="text-sm">{toast.message}</span>
        </div>
      ))}
    </div>
  )
}

export default ToastNotification
