import React, { useState } from 'react'
import { usePolling } from '../hooks/usePolling'
import { api } from '../services/api'
import type { Signal } from '../types'
import ApprovalModal from './ApprovalModal'
import StatusBadge from './StatusBadge'

const ApprovalQueue = () => {
  const approvals = usePolling(() => api.getApprovals(), 10000)
  const [selected, setSelected] = useState<Signal | null>(null)

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">
        Approval Queue <span className="text-sm text-gray-400">({approvals?.length || 0} pending)</span>
      </h3>
      <div className="space-y-4">
        {approvals?.map(signal => (
          <div
            key={signal.id}
            className="bg-gray-800 p-4 rounded hover:bg-gray-700 cursor-pointer"
            onClick={() => setSelected(signal)}
          >
            <div className="flex justify-between items-center">
              <div>
                <h4 className="text-white text-sm">{signal.subject}</h4>
                <p className="text-xs text-gray-400">{signal.preview.slice(0, 100)}...</p>
              </div>
              <StatusBadge status={signal.urgency} variant="urgency" />
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Waiting for {Math.floor((Date.now() - new Date(signal.timestamp).getTime()) / 60000)} minutes
            </div>
          </div>
        ))}
      </div>
      {selected && <ApprovalModal signal={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

export default ApprovalQueue
