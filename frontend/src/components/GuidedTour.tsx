import React, { useEffect, useState } from 'react'

const steps = [
  'Welcome! This is the signal feed showing incoming messages.',
  'AI classifies each signal’s urgency and importance.',
  'Actions are automatically executed here.',
  'Review and approve high-impact actions here.',
  'Monitor system health and performance here.'
]

const GuidedTour = () => {
  const [step, setStep] = useState(0)
  const [active, setActive] = useState(false)

  useEffect(() => {
    const seen = localStorage.getItem('tourSeen')
    if (!seen) {
      setActive(true)
      localStorage.setItem('tourSeen', 'true')
    }
  }, [])

  if (!active) return null

  return (
    <div className="fixed bottom-4 left-4 bg-gray-900 text-white p-4 rounded shadow z-50 w-80">
      <p className="text-sm mb-2">{steps[step]}</p>
      <div className="flex justify-between items-center">
        <button
          onClick={() => setStep(s => Math.max(0, s - 1))}
          className="text-xs text-gray-300 hover:text-white"
        >
          Previous
        </button>
        <span className="text-xs text-gray-400">Step {step + 1} of {steps.length}</span>
        {step < steps.length - 1 ? (
          <button
            onClick={() => setStep(s => s + 1)}
            className="text-xs text-blue-400 hover:text-white"
          >
            Next
          </button>
        ) : (
          <button
            onClick={() => setActive(false)}
            className="text-xs text-green-400 hover:text-white"
          >
            Finish
          </button>
        )}
      </div>
    </div>
  )
}

export default GuidedTour
