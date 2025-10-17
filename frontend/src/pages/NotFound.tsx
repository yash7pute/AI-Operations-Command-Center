import React from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'

const NotFound = () => {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white text-center px-4">
      <AlertTriangle className="w-12 h-12 text-yellow-500 mb-4" />
      <h1 className="text-3xl font-bold mb-2">404 - Page Not Found</h1>
      <p className="text-gray-400 mb-6">
        The page you’re looking for doesn’t exist or has been moved.
      </p>
      <Link
        to="/"
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
      >
        Go to Dashboard
      </Link>
    </div>
  )
}

export default NotFound
