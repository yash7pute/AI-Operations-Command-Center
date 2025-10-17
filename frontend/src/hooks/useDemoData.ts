import { useState, useEffect } from 'react'
import {
  createMockSignals,
  createMockClassifications,
  createMockActions,
  createMockMetrics
} from '../services/mockData'

export const useDemoData = (enabled: boolean) => {
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    if (enabled) {
      const signals = createMockSignals(20)
      const classifications = createMockClassifications(signals)
      const actions = createMockActions(classifications)
      const metrics = createMockMetrics()
      setData({ signals, classifications, actions, metrics })
    } else {
      setData(null)
    }
  }, [enabled])

  return data
}
