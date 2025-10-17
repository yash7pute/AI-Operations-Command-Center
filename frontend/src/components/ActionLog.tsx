import React from 'react'
import { usePolling } from '../hooks/usePolling'
import { api } from '../services/api'
import type { Action } from '../types'
import StatusBadge from './StatusBadge'
import { ExternalLink } from 'lucide-react'

const platformColors: Record<string, string> = {
  Notion: 'bg-purple-600',
  Trello: 'bg-green-600',
  Slack: 'bg-blue-600',
  Drive: 'bg-yellow-500',
  Sheets: 'bg-teal-500'
}

const ActionLog = () => {
  const actions = usePolling(() => api.getActions(50), 3000)

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">Action Log</h3>
      <div className="space-y-4">
        {actions?.map(action => (
          <div
            key={action.id}
            className="bg-gray-800 p-4 rounded shadow hover:bg-gray-700"
          >
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-300">
                {new Date(action.timestamp).toLocaleTimeString()}
              </div>
              <StatusBadge status={action.status} variant="status" />
            </div>
            <div className="mt-2">
              <p className="text-white text-sm">
                {action.description || `Executed ${action.type} on ${action.platform}`}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`px-2 py-1 text-xs rounded text-white ${
                    platformColors[action.platform] || 'bg-gray-600'
                  }`}
                >
                  {action.platform}
                </span>
                {action.resourceLink && (
                  <a
                    href={action.resourceLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 text-xs flex items-center gap-1"
                  >
                    View Resource <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ActionLog
