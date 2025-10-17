import React, { useState } from 'react'
import { usePolling } from '../hooks/usePolling'
import { api } from '../services/api'
import type { Signal } from '../types'

const SignalReplay = () => {
  const signals = usePolling(() => api.getSignals(50), 10000)
  const [replaying, setReplaying] = useState<string | null>(null)
  const [result, setResult] = useState('')

  const handleReplay = async (id: string) => {
    setReplaying(id)
    try {
      const res = await api.replaySignal(id)
      setResult(`Replay complete. Differences: ${res.differences || 'None'}`)
    } catch {
      setResult('Replay failed.')
    } finally {
      setReplaying(null)
    }
  }

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">Signal Replay</h3>
      <div className="space-y-3">
        {signals?.map((s: Signal) => (
          <div
            key={s.id}
            className="bg-gray-800 p-3 rounded flex justify-between items-center"
          >
            <div>
              <p className="text-sm text-white">{s.subject}</p>
              <p className="text-xs text-gray-400">{s.preview.slice(0, 80)}...</p>
            </div>
            <button
              onClick={() => handleReplay(s.id)}
              disabled={replaying === s.id}
              className="bg-blue-600 text-white px-3 py-1 rounded text-xs"
            >
              {replaying === s.id ? 'Replaying...' : 'Replay'}
            </button>
          </div>
        ))}
        {result && <p className="text-sm text-gray-400 mt-2">{result}</p>}
      </div>
    </div>
  )
}

export default SignalReplay
