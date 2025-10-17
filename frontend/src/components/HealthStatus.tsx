import React from 'react'
import { usePolling } from '../hooks/usePolling'
import { api } from '../services/api'
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'

const statusIcons = {
  Healthy: <CheckCircle2 className="text-green-500 w-4 h-4" />,
  Degraded: <AlertTriangle className="text-yellow-500 w-4 h-4" />,
  Down: <XCircle className="text-red-500 w-4 h-4" />
}

const HealthStatus = () => {
  const health = usePolling(() => api.getHealthStatus(), 30000)

  const overallStatus = health?.status || 'Unknown'
  const components = health?.components || {}

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">System Health</h3>
      <div className="mb-4">
        <span className="text-sm text-gray-300">Overall Status:</span>{' '}
        <span className="text-lg font-bold">
          {statusIcons[overallStatus]} {overallStatus}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(components).map(([name, status]) => (
          <div
            key={name}
            className="bg-gray-800 p-4 rounded flex justify-between items-center"
          >
            <span className="text-sm text-white">{name}</span>
            <span className="flex items-center gap-1 text-sm">
              {statusIcons[status]} {status}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default HealthStatus
