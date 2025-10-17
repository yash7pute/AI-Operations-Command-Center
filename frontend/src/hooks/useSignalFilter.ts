import { useMemo } from 'react'
import type { Signal } from '../types'

export const useSignalFilter = (
  signals: Signal[],
  filter: { urgency?: string; source?: string; search?: string }
) => {
  return useMemo(() => {
    return signals.filter(s =>
      (!filter.urgency || s.urgency === filter.urgency) &&
      (!filter.source || s.source === filter.source) &&
      (!filter.search ||
        s.subject.toLowerCase().includes(filter.search.toLowerCase()) ||
        s.preview.toLowerCase().includes(filter.search.toLowerCase()))
    )
  }, [signals, filter])
}
