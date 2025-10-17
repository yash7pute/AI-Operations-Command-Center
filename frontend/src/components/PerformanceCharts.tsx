import React from 'react'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  XAxis,
  YAxis,
  ResponsiveContainer
} from 'recharts'
import { usePolling } from '../hooks/usePolling'
import { api } from '../services/api'

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#14b8a6']

const PerformanceCharts = () => {
  const data = usePolling(() => api.getMetrics(), 30000)

  return (
    <div className="space-y-8">
      <h3 className="text-xl font-semibold">Performance Charts</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 className="text-sm mb-2">Signals Over Time</h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data?.signalsOverTime || []}>
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="total" stroke="#6366f1" />
              <Line type="monotone" dataKey="gmail" stroke="#10b981" />
              <Line type="monotone" dataKey="slack" stroke="#f59e0b" />
              <Line type="monotone" dataKey="sheets" stroke="#ef4444" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div>
          <h4 className="text-sm mb-2">Action Success Rate</h4>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data?.successRateOverTime || []}>
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Area type="monotone" dataKey="rate" stroke="#10b981" fill="#10b981" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div>
          <h4 className="text-sm mb-2">Processing Time Distribution</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data?.processingBuckets || []}>
              <XAxis dataKey="bucket" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#6366f1" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div>
          <h4 className="text-sm mb-2">Actions by Platform</h4>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={data?.actionsByPlatform || []}
                dataKey="value"
                nameKey="platform"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label
              >
                {data?.actionsByPlatform?.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

export default PerformanceCharts
