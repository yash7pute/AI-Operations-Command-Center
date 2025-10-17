import React from 'react'
import { usePolling } from '../hooks/usePolling'
import { api } from '../services/api'
import type { Action } from '../types'
import { Loader2 } from 'lucide-react'

const LiveMonitor = () => {
  const actions = usePolling(() => api.getActions(10), 1000)
  const executing = actions?.filter(a => a.status === 'Processing')

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">Live Execution Monitor</h3>
      {executing?.length ? (
        <div className="space-y-3">
          {executing.map(action => (
            <div
              key={action.id}
              className="bg-gray-800 p-3 rounded flex justify-between items-center"
            >
              <div>
                <p className="text-sm text-white">
                  Executing: {action.type} on {action.platform}
                </p>
                <p className="text-xs text-gray-400">
                  Started at {new Date(action.timestamp).toLocaleTimeString()}
                </p>
              </div>
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-400 text-sm">No actions executing</p>
      )}
    </div>
  )
}

export default LiveMonitor
