import React, { useState } from 'react'
import { usePolling } from '../hooks/usePolling'
import { api } from '../services/api'
import { Download } from 'lucide-react'

interface ErrorEntry {
  id: string
  timestamp: string
  component: string
  message: string
  severity: 'error' | 'warning'
  stack?: string
}

const ErrorLog = () => {
  const errors = usePolling(() => api.getMetrics().then(d => d.errors || []), 15000)
  const [filter, setFilter] = useState<'all' | 'error' | 'warning'>('all')
  const [search, setSearch] = useState('')

  const filtered = errors?.filter(e =>
    (filter === 'all' || e.severity === filter) &&
    (e.message.toLowerCase().includes(search.toLowerCase()) ||
      e.component.toLowerCase().includes(search.toLowerCase()))
  )

  const exportCSV = () => {
    const rows = filtered?.map(e =>
      `${e.timestamp},${e.component},${e.severity},${e.message.replace(/,/g, ' ')}`
    )
    const blob = new Blob([`timestamp,component,severity,message\n${rows?.join('\n')}`], {
      type: 'text/csv'
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'error-log.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">Error Log</h3>
      <div className="flex gap-2 mb-4">
        <select
          value={filter}
          onChange={e => setFilter(e.target.value as any)}
          className="bg-gray-800 text-white px-3 py-1 rounded"
        >
          <option value="all">All</option>
          <option value="error">Errors</option>
          <option value="warning">Warnings</option>
        </select>
        <input
          type="text"
          placeholder="Search errors..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-gray-800 text-white px-3 py-1 rounded"
        />
        <button
          onClick={exportCSV}
          className="bg-blue-600 text-white px-3 py-1 rounded flex items-center gap-1"
        >
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>
      <div className="space-y-4">
        {filtered?.map(error => (
          <div
            key={error.id}
            className={`p-4 rounded bg-gray-800 border-l-4 ${
              error.severity === 'error' ? 'border-red-500' : 'border-yellow-500'
            }`}
          >
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-300">{error.timestamp}</span>
              <span className="text-xs text-gray-400">{error.component}</span>
            </div>
            <p className="text-sm text-white mt-1">{error.message}</p>
            {error.stack && (
              <details className="text-xs text-gray-400 mt-2">
                <summary>Stack Trace</summary>
                <pre className="whitespace-pre-wrap">{error.stack}</pre>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default ErrorLog
