import type { Signal, Classification, Action } from '../types'

// Use relative URLs - Vite proxy will handle forwarding to backend
const BASE_URL = '/api'

async function fetchWithRetry<T>(url: string, options?: RequestInit): Promise<T> {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, options)
      if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`)
      const json = await res.json()
      // Backend wraps responses in { success, data, timestamp } format
      return json.data !== undefined ? json.data : json
    } catch (err) {
      console.error(`Attempt ${i + 1} failed:`, err)
      if (i === 2) throw err // Throw on last attempt
    }
  }
  throw new Error('All retries failed')
}

export const api = {
  getSignals: (limit = 20) =>
    fetchWithRetry<Signal[]>(`${BASE_URL}/signals?limit=${limit}`),
  getClassifications: (limit = 20) =>
    fetchWithRetry<Classification[]>(`${BASE_URL}/classifications?limit=${limit}`),
  getActions: (limit = 50) =>
    fetchWithRetry<Action[]>(`${BASE_URL}/actions?limit=${limit}`),
  getHealthStatus: () =>
    fetchWithRetry<{ status: string; components?: Record<string, string> }>(
      `${BASE_URL}/health`
    ),
  getDashboard: () =>
    fetchWithRetry<any>(`${BASE_URL}/dashboard`),
  getStatus: () =>
    fetchWithRetry<any>(`${BASE_URL}/status`),
  getMetrics: () =>
    fetchWithRetry<any>(`${BASE_URL}/metrics`),
}

// Legacy exports for compatibility
export const fetchSignals = () => api.getSignals()
export const fetchMetrics = () => api.getMetrics()
export const fetchActions = () => api.getActions()
export const fetchHealthStatus = () => api.getHealthStatus()
