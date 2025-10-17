import React, { useState } from 'react'
import { createMockSignals, createMockClassifications, createMockActions, createMockMetrics } from '../services/mockData'

const DemoMode = () => {
  const [enabled, setEnabled] = useState(false)
  const [data, setData] = useState<any>(null)

  const toggleDemo = () => {
    if (!enabled) {
      const signals = createMockSignals(20)
      const classifications = createMockClassifications(signals)
      const actions = createMockActions(classifications)
      const metrics = createMockMetrics()
      setData({ signals, classifications, actions, metrics })
    } else {
      setData(null)
    }
    setEnabled(!enabled)
  }

  return (
    <div className="flex items-center gap-4 mb-6">
      <label className="text-sm text-gray-300">Demo Mode</label>
      <button
        onClick={toggleDemo}
        className={`px-4 py-2 rounded ${
          enabled ? 'bg-red-600' : 'bg-green-600'
        } text-white`}
      >
        {enabled ? 'Disable' : 'Enable'}
      </button>
    </div>
  )
}

export default DemoMode
