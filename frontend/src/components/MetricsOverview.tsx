import React from 'react'
import { usePolling } from '../hooks/usePolling'
import { api } from '../services/api'
import { BarChart3, Clock, CheckCircle2, AlertTriangle } from 'lucide-react'

const MetricsOverview = () => {
  const metrics = usePolling(() => api.getMetrics(), 30000)

  const cards = [
    {
      label: 'Signals Processed',
      value: metrics?.signalsToday || 0,
      icon: <BarChart3 className="w-5 h-5" />
    },
    {
      label: 'Tasks Created',
      value: metrics?.tasksCreated || 0,
      icon: <CheckCircle2 className="w-5 h-5" />
    },
    {
      label: 'Success Rate',
      value: `${metrics?.successRate || 0}%`,
      icon: <CheckCircle2 className="w-5 h-5" />,
      color:
        metrics?.successRate > 95
          ? 'bg-green-600'
          : metrics?.successRate > 90
          ? 'bg-yellow-500'
          : 'bg-red-600'
    },
    {
      label: 'Avg Processing Time',
      value: `${metrics?.avgTime || 0}s`,
      icon: <Clock className="w-5 h-5" />
    },
    {
      label: 'Pending Approvals',
      value: metrics?.pendingApprovals || 0,
      icon: <AlertTriangle className="w-5 h-5" />
    },
    {
      label: 'Queue Depth',
      value: metrics?.queueDepth || 0,
      icon: <BarChart3 className="w-5 h-5" />
    }
  ]

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">System Metrics</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card, i) => (
          <div
            key={i}
            className={`bg-gray-800 p-4 rounded flex items-center gap-4 ${
              card.color || ''
            }`}
          >
            {card.icon}
            <div>
              <div className="text-xl font-bold">{card.value}</div>
              <div className="text-sm text-gray-300">{card.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default MetricsOverview
