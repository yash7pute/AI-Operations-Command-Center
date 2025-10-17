import React, { useState } from 'react'
import { api } from '../services/api'

const ManualActionTrigger = () => {
  const [form, setForm] = useState({
    type: 'Create Task',
    platform: 'Notion',
    title: '',
    description: '',
    due: '',
    priority: 3,
    assignee: '',
    signalId: ''
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async () => {
    setLoading(true)
    try {
      await api.triggerManualAction(form)
      setMessage('Action executed successfully!')
    } catch (err) {
      setMessage('Error executing action.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4">Manual Action Trigger</h3>
      <div className="space-y-3">
        <select
          value={form.type}
          onChange={e => setForm({ ...form, type: e.target.value })}
          className="w-full bg-gray-800 text-white p-2 rounded"
        >
          <option>Create Task</option>
          <option>Send Notification</option>
          <option>File Document</option>
          <option>Update Sheet</option>
        </select>
        <select
          value={form.platform}
          onChange={e => setForm({ ...form, platform: e.target.value })}
          className="w-full bg-gray-800 text-white p-2 rounded"
        >
          <option>Notion</option>
          <option>Trello</option>
          <option>Slack</option>
          <option>Drive</option>
          <option>Sheets</option>
        </select>
        <input
          type="text"
          placeholder="Title"
          value={form.title}
          onChange={e => setForm({ ...form, title: e.target.value })}
          className="w-full bg-gray-800 text-white p-2 rounded"
        />
        <textarea
          placeholder="Description"
          value={form.description}
          onChange={e => setForm({ ...form, description: e.target.value })}
          className="w-full bg-gray-800 text-white p-2 rounded"
        />
        <input
          type="date"
          value={form.due}
          onChange={e => setForm({ ...form, due: e.target.value })}
          className="w-full bg-gray-800 text-white p-2 rounded"
        />
        <input
          type="number"
          min={1}
          max={5}
          value={form.priority}
          onChange={e => setForm({ ...form, priority: parseInt(e.target.value) })}
          className="w-full bg-gray-800 text-white p-2 rounded"
        />
        <input
          type="text"
          placeholder="Assignee"
          value={form.assignee}
          onChange={e => setForm({ ...form, assignee: e.target.value })}
          className="w-full bg-gray-800 text-white p-2 rounded"
        />
        <input
          type="text"
          placeholder="Source Signal ID (optional)"
          value={form.signalId}
          onChange={e => setForm({ ...form, signalId: e.target.value })}
          className="w-full bg-gray-800 text-white p-2 rounded"
        />
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          {loading ? 'Executing...' : 'Execute Action'}
        </button>
        {message && <p className="text-sm text-gray-400 mt-2">{message}</p>}
      </div>
    </div>
  )
}

export default ManualActionTrigger
