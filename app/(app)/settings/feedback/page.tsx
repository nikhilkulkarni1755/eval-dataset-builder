'use client'

import { useState } from 'react'

const TYPES = ['General feedback', 'Bug report', 'Feature request', 'Question']

export default function FeedbackPage() {
  const [type, setType] = useState(TYPES[0])
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')

    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, message }),
    })

    setStatus(res.ok ? 'sent' : 'error')
  }

  return (
    <div className="p-8 max-w-lg">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Feedback & support</h1>
      <p className="text-sm text-gray-500 mb-6">We read every message and reply within 24 hours.</p>

      {status === 'sent' ? (
        <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-6 text-sm text-green-700">
          Got it — thanks for the feedback. We'll be in touch if needed.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
            <div className="flex flex-wrap gap-2">
              {TYPES.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    type === t
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={5}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
              placeholder="What's on your mind?"
            />
          </div>

          {status === 'error' && (
            <p className="text-sm text-red-600">Something went wrong — try again.</p>
          )}

          <button
            type="submit"
            disabled={status === 'sending' || !message.trim()}
            className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {status === 'sending' ? 'Sending...' : 'Send'}
          </button>
        </form>
      )}
    </div>
  )
}
