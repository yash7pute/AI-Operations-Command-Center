import React, { useEffect, useRef } from 'react'
import { usePolling } from '../hooks/usePolling'
import { api } from '../services/api'

interface Activity {
  id: string
  timestamp: string
  type: string
  message: string
}

const typeColors: Record<string, string> = {
  Gmail: 'text-blue-400',
  Slack: 'text-purple-400',
  Sheets: 'text-green-400',
  AI: 'text-yellow-400',
  Notion: 'text-pink-400',
  User: 'text-white'
}

const ActivityFeed = () => {
  const feed = usePolling(() => api.getMetrics().then(d => d.activity || []), 5000)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [feed])

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">Activity Feed</h3>
      <div
        ref={containerRef}
        className="bg-gray-900 p-4 rounded h-64 overflow-y-auto space-y-2"
      >
        {feed?.slice(-100).map((event: Activity) => (
          <div key={event.id} className="text-sm text-gray-300">
            <span className="text-xs text-gray-500 mr-2">
              {new Date(event.timestamp).toLocaleTimeString()}
            </span>
            <span className={`${typeColors[event.type] || 'text-white'} font-medium`}>
              {event.type}:
            </span>{' '}
            {event.message}
          </div>
        ))}
      </div>
    </div>
  )
}

export default ActivityFeed
