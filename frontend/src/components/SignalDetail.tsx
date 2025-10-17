import React from 'react'
import type { Signal } from '../types'
import StatusBadge from './StatusBadge'

const SignalDetail = ({
  signal,
  onClose
}: {
  signal: Signal
  onClose: () => void
}) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-gray-900 p-6 rounded-lg w-full max-w-xl relative">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-400 hover:text-white"
        >
          ✕
        </button>
        <h3 className="text-xl font-bold mb-2">{signal.subject}</h3>
        <p className="text-sm text-gray-400 mb-4">{signal.preview}</p>
        <div className="space-y-2">
          <div>
            <strong>Source:</strong> {signal.source}
          </div>
          <div>
            <strong>Timestamp:</strong>{' '}
            {new Date(signal.timestamp).toLocaleString()}
          </div>
          <div className="flex gap-2">
            <StatusBadge status={signal.status} variant="status" />
            <StatusBadge status={signal.urgency} variant="urgency" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default SignalDetail
