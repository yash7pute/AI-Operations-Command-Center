import React from 'react'
import type { Signal } from '../types'
import StatusBadge from './StatusBadge'

const stages = ['Signal Received', 'Classified', 'Decision Made', 'Action Executed']

const ActionTimeline = ({
  signal,
  classification,
  action
}: {
  signal: Signal
  classification?: { reasoning: string; confidence: number }
  action?: { type: string; status: string }
}) => {
  return (
    <div className="bg-gray-900 p-4 rounded-lg">
      <h4 className="text-lg font-semibold mb-4">Action Timeline</h4>
      <div className="flex flex-col md:flex-row gap-4 justify-between">
        {stages.map((stage, index) => {
          const isCompleted = index <=
            (action ? 3 : classification ? 2 : signal ? 0 : -1)
          return (
            <div key={stage} className="flex-1 text-center">
              <div
                className={`p-2 rounded-full mx-auto w-8 h-8 flex items-center justify-center ${
                  isCompleted ? 'bg-green-500' : 'bg-gray-600'
                }`}
              >
                {index + 1}
              </div>
              <p className="text-sm mt-2">{stage}</p>
              {index === 1 && classification && (
                <p className="text-xs text-gray-400 mt-1">
                  {classification.reasoning} ({classification.confidence}%)
                </p>
              )}
              {index === 3 && action && (
                <StatusBadge status={action.status} variant="status" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ActionTimeline
