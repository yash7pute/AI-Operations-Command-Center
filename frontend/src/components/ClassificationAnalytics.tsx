import React from 'react'
import {
  PieChart,
  Pie,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts'
import { usePolling } from '../hooks/usePolling'
import { api } from '../services/api'

const COLORS = ['#ef4444', '#f59e0b', '#fbbf24', '#10b981']

const ClassificationAnalytics = () => {
  const data = usePolling(() => api.getMetrics(), 30000)

  return (
    <div className="space-y-8">
      <h3 className="text-xl font-semibold">Classification Analytics</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Urgency Breakdown */}
        <div>
          <h4 className="text-sm mb-2">Urgency Breakdown</h4>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={data?.urgencyBreakdown || []}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label
              >
                {data?.urgencyBreakdown?.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Category Distribution */}
        <div>
          <h4 className="text-sm mb-2">Category Distribution</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data?.categoryDistribution || []}>
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#6366f1" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Confidence Score Distribution */}
        <div>
          <h4 className="text-sm mb-2">Confidence Score Distribution</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data?.confidenceHistogram || []}>
              <XAxis dataKey="bucket" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Accuracy Over Time */}
        <div>
          <h4 className="text-sm mb-2">Accuracy Over Time</h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data?.accuracyOverTime || []}>
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="accuracy" stroke="#f59e0b" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Confidence Gauge + Summary */}
      <div className="mt-6">
        <h4 className="text-sm mb-2">Average Confidence Score</h4>
        <div className="text-3xl font-bold text-green-400">
          {data?.avgConfidence || 0}%
        </div>
        <p className="text-sm text-gray-400 mt-2">
          Most common signal patterns: {data?.topPatterns?.join(', ') || 'N/A'}
        </p>
        <p className="text-sm text-gray-400">
          Classification accuracy improved {data?.accuracyDelta || 0}% this week
        </p>
      </div>
    </div>
  )
}

export default ClassificationAnalytics
