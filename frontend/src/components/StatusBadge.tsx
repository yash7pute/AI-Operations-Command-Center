import React from 'react'
import {
  AlertCircle,
  ArrowUp,
  ArrowDown,
  Minus,
  Loader2,
  Check,
  X
} from 'lucide-react'

const variants = {
  Critical: { color: 'bg-red-600', icon: <AlertCircle className="w-4 h-4" /> },
  High: { color: 'bg-orange-500', icon: <ArrowUp className="w-4 h-4" /> },
  Medium: { color: 'bg-yellow-400', icon: <Minus className="w-4 h-4" /> },
  Low: { color: 'bg-green-500', icon: <ArrowDown className="w-4 h-4" /> },
  Processing: { color: 'bg-blue-500', icon: <Loader2 className="w-4 h-4 animate-spin" /> },
  Completed: { color: 'bg-green-600', icon: <Check className="w-4 h-4" /> },
  Failed: { color: 'bg-red-600', icon: <X className="w-4 h-4" /> }
}

const StatusBadge = ({
  status,
  variant
}: {
  status: string
  variant: 'urgency' | 'status'
}) => {
  const v = variants[status as keyof typeof variants]
  if (!v) return null

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-white ${v.color}`}
      title={status}
    >
      {v.icon}
      {status}
    </span>
  )
}

export default StatusBadge
