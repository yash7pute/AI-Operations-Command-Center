import React from 'react'
import { usePolling } from '../hooks/usePolling'
import { api } from '../services/api'

const ConfigPanel = () => {
  const config = usePolling(() => api.getMetrics().then(d => d.config || {}), 30000)

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">System Configuration</h3>
      <div className="space-y-2">
        <div><strong>Confidence Thresholds:</strong> {config?.confidenceThresholds || 'N/A'}</div>
        <div><strong>Rate Limits:</strong> {config?.rateLimits || 'N/A'}</div>
        <div><strong>Queue Settings:</strong> {config?.queueSettings || 'N/A'}</div>
        <div><strong>Enabled Features:</strong> {config?.features?.join(', ') || 'N/A'}</div>
        <div><strong>Last Updated:</strong> {config?.lastUpdated || 'N/A'}</div>
        <div className="text-xs text-gray-400 mt-2">
          To update these settings, modify your `.env` file and restart the system.
        </div>
      </div>
    </div>
  )
}

export default ConfigPanel
