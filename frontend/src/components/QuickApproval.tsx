import React from 'react'
import { usePolling } from '../hooks/usePolling'
import { api } from '../services/api'
import type { Signal } from '../types'

const QuickApproval = () => {
  const approvals = usePolling(() => api.getApprovals(), 10000)

  const handleApprove = async (id: string) => {
    await api.approveAction(id)
  }

  const handleReject = async (id: string) => {
    const reason = prompt('Enter rejection reason:')
    if (reason) await api.rejectAction(id, reason)
  }

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">Quick Approval</h3>
      <div className="space-y-2">
        {approvals?.map((signal: Signal) => (
          <div key={signal.id} className="bg-gray-800 p-3 rounded flex justify-between items-center">
            <div>
              <p className="text-sm text-white">{signal.subject}</p>
              <p className="text-xs text-gray-400">{signal.preview.slice(0, 80)}...</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleApprove(signal.id)} className="bg-green-600 px-2 py-1 rounded text-xs text-white">Approve</button>
              <button onClick={() => handleReject(signal.id)} className="bg-red-600 px-2 py-1 rounded text-xs text-white">Reject</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default QuickApproval
