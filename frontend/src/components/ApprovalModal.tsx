import React, { useState } from 'react'
import type { Signal } from '../types'
import StatusBadge from './StatusBadge'
import { api } from '../services/api'

const ApprovalModal = ({
  signal,
  onClose
}: {
  signal: Signal
  onClose: () => void
}) => {
  const [mode, setMode] = useState<'default' | 'modify' | 'reject'>('default')
  const [modifications, setModifications] = useState({ title: '', description: '', due: '', priority: 'Medium', platform: 'Notion' })
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  const handleApprove = async () => {
    setLoading(true)
    await api.approveAction(signal.id, modifications)
    setLoading(false)
    onClose()
  }

  const handleReject = async () => {
    setLoading(true)
    await api.rejectAction(signal.id, reason)
    setLoading(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-gray-900 p-6 rounded-lg w-full max-w-xl relative">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-400 hover:text-white"
        >
          ✕
        </button>
        <h3 className="text-xl font-bold mb-2">Review Action</h3>
        <p className="text-sm text-gray-400 mb-4">{signal.preview}</p>
        <div className="space-y-2">
          <div><strong>Source:</strong> {signal.source}</div>
          <div><strong>Urgency:</strong> <StatusBadge status={signal.urgency} variant="urgency" /></div>
          <div><strong>Reasoning:</strong> Classified as high priority due to keywords</div>
        </div>

        {mode === 'modify' && (
          <div className="mt-4 space-y-2">
            <input type="text" placeholder="Title" value={modifications.title} onChange={e => setModifications({ ...modifications, title: e.target.value })} className="w-full bg-gray-800 text-white p-2 rounded" />
            <textarea placeholder="Description" value={modifications.description} onChange={e => setModifications({ ...modifications, description: e.target.value })} className="w-full bg-gray-800 text-white p-2 rounded" />
            <input type="date" value={modifications.due} onChange={e => setModifications({ ...modifications, due: e.target.value })} className="w-full bg-gray-800 text-white p-2 rounded" />
            <select value={modifications.priority} onChange={e => setModifications({ ...modifications, priority: e.target.value })} className="w-full bg-gray-800 text-white p-2 rounded">
              <option>Critical</option>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
            <select value={modifications.platform} onChange={e => setModifications({ ...modifications, platform: e.target.value })} className="w-full bg-gray-800 text-white p-2 rounded">
              <option>Notion</option>
              <option>Trello</option>
              <option>Slack</option>
              <option>Drive</option>
              <option>Sheets</option>
            </select>
          </div>
        )}

        {mode === 'reject' && (
          <textarea placeholder="Reason for rejection" value={reason} onChange={e => setReason(e.target.value)} className="w-full bg-gray-800 text-white p-2 rounded mt-4" />
        )}

        <div className="flex gap-2 mt-6">
          {mode === 'default' && (
            <>
              <button onClick={handleApprove} className="bg-green-600 px-4 py-2 rounded text-white" disabled={loading}>Approve</button>
              <button onClick={() => setMode('modify')} className="bg-blue-600 px-4 py-2 rounded text-white">Modify & Approve</button>
              <button onClick={() => setMode('reject')} className="bg-red-600 px-4 py-2 rounded text-white">Reject</button>
            </>
          )}
          {mode === 'modify' && (
            <button onClick={handleApprove} className="bg-blue-600 px-4 py-2 rounded text-white" disabled={loading}>Submit Modified</button>
          )}
          {mode === 'reject' && (
            <button onClick={handleReject} className="bg-red-600 px-4 py-2 rounded text-white" disabled={loading}>Submit Rejection</button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ApprovalModal
