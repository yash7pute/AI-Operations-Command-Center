import React from 'react'
import { AlertTriangle, XCircle } from 'lucide-react'

interface Alert {
  id: string
  message: string
  type: 'critical' | 'warning'
}

const AlertBanner = ({ alerts }: { alerts: Alert[] }) => {
  const icon = {
    critical: <XCircle className="text-red-500 w-4 h-4 animate-pulse" />,
    warning: <AlertTriangle className="text-yellow-500 w-4 h-4 animate-pulse" />
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-40">
      {alerts.map(alert => (
        <div
          key={alert.id}
          className={`flex items-center justify-between px-4 py-2 ${
            alert.type === 'critical' ? 'bg-red-900' : 'bg-yellow-900'
          } text-white`}
        >
          <div className="flex items-center gap-2">
            {icon[alert.type]}
            <span>{alert.message}</span>
          </div>
          <button className="text-sm text-gray-300 hover:text-white">Dismiss</button>
        </div>
      ))}
    </div>
  )
}

export default AlertBanner
