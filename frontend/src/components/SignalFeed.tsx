import React, { useState } from 'react'
import { usePolling } from '../hooks/usePolling'
import { api } from '../services/api'
import type { Signal } from '../types'
import SignalDetail from './SignalDetail'
import StatusBadge from './StatusBadge'
import { Mail, MessageSquare, Table } from 'lucide-react'

const sourceIcons = {
  Gmail: <Mail className="w-4 h-4" />,
  Slack: <MessageSquare className="w-4 h-4" />,
  Sheets: <Table className="w-4 h-4" />
}

const SignalFeed = () => {
  const signals = usePolling(() => api.getSignals(20), 5000)
  const [selected, setSelected] = useState<Signal | null>(null)
  const [filter, setFilter] = useState<'All' | 'Gmail' | 'Slack' | 'Sheets'>('All')
  const [search, setSearch] = useState('')

  const filtered = signals?.filter(
    s =>
      (filter === 'All' || s.source === filter) &&
      (s.subject.toLowerCase().includes(search.toLowerCase()) ||
        s.preview.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold">Live Signal Feed</h3>
        <input
          type="text"
          placeholder="Search signals..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-gray-800 text-white px-3 py-1 rounded"
        />
      </div>
      <div className="flex gap-2 mb-4">
        {['All', 'Gmail', 'Slack', 'Sheets'].map(src => (
          <button
            key={src}
            onClick={() => setFilter(src as any)}
            className={`px-3 py-1 rounded ${
              filter === src ? 'bg-blue-600' : 'bg-gray-700'
            }`}
          >
            {src}
          </button>
        ))}
      </div>
      <div className="grid gap-4">
        {filtered?.map(signal => (
          <div
            key={signal.id}
            onClick={() => setSelected(signal)}
            className="bg-gray-800 p-4 rounded hover:bg-gray-700 cursor-pointer"
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                {sourceIcons[signal.source]}
                <span className="text-sm text-gray-300">{signal.source}</span>
              </div>
              <span className="text-xs text-gray-400">
                {new Date(signal.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <h4 className="text-lg font-medium mt-2">{signal.subject}</h4>
            <p className="text-sm text-gray-400">{signal.preview.slice(0, 100)}...</p>
            <div className="flex justify-between items-center mt-2">
              <StatusBadge status={signal.status} variant="status" />
              <StatusBadge status={signal.urgency} variant="urgency" />
            </div>
          </div>
        ))}
      </div>
      {selected && <SignalDetail signal={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

export default SignalFeed
