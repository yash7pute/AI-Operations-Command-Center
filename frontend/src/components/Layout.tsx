import React from 'react'
import { HeartPulse } from 'lucide-react'

const Layout = ({ children }: { children?: React.ReactNode }) => {
  return (
    <div className="flex h-screen bg-gray-900 text-white">
      <aside className="w-64 bg-gray-800 p-4 hidden md:block">
        <h1 className="text-xl font-bold mb-6">AI Operations</h1>
        <nav className="space-y-4">
          <a href="#" className="block hover:text-blue-400">Dashboard</a>
          <a href="#" className="block hover:text-blue-400">Signals</a>
          <a href="#" className="block hover:text-blue-400">Actions</a>
          <a href="#" className="block hover:text-blue-400">Approvals</a>
          <a href="#" className="block hover:text-blue-400">Analytics</a>
          <a href="#" className="block hover:text-blue-400">Settings</a>
        </nav>
      </aside>
      <main className="flex-1 p-6 overflow-y-auto">
        <header className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold">AI Operations Command Center</h2>
          <div className="flex items-center gap-2">
            <HeartPulse className="text-green-400 animate-pulse" />
            <span className="text-sm">System Healthy</span>
          </div>
        </header>
        {children}
      </main>
    </div>
  )
}

export default Layout
