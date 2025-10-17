import { useEffect, useState } from 'react'

export const usePolling = <T>(fetchFn: () => Promise<T>, interval = 10000) => {
  const [data, setData] = useState<T | null>(null)

  useEffect(() => {
    let mounted = true
    const poll = async () => {
      try {
        const result = await fetchFn()
        if (mounted) setData(result)
      } catch (err) {
        console.error('Polling error:', err)
      }
    }
    poll()
    const id = setInterval(poll, interval)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [fetchFn, interval])

  return data
}
