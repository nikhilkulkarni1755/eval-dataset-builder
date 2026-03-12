'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface GeneratePageProps {
  params: Promise<{ id: string }>
}

const COUNT_OPTIONS = [50, 100, 200, 500] as const

export default function GeneratePage({ params }: GeneratePageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [projectId, setProjectId] = useState<string>('')
  const [targetCount, setTargetCount] = useState<number>(100)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    params.then(({ id }) => setProjectId(id))
  }, [params])

  // Auto-trigger if coming back from Stripe success
  useEffect(() => {
    const sessionId = searchParams.get('session_id')
    if (sessionId && projectId) {
      handleGenerate()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, projectId])

  async function handleGenerate() {
    setGenerating(true)
    setProgress(0)
    setError('')
    setStatus('Starting generation...')

    abortRef.current = new AbortController()

    try {
      const res = await fetch(`/api/projects/${projectId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_count: targetCount }),
        signal: abortRef.current.signal,
      })

      if (res.status === 402) {
        const body = await res.json()
        if (body.requiresPayment) {
          setStatus('Redirecting to checkout...')
          const checkoutRes = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId }),
          })
          const { url } = await checkoutRes.json()
          window.location.href = url
          return
        }
        if (body.requiresOverage) {
          setError('You\'ve reached your monthly limit of 1,000 examples. Overage charges apply ($10 / 500 examples).')
          setGenerating(false)
          return
        }
      }

      if (!res.ok) {
        throw new Error(await res.text())
      }

      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter(Boolean)

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.generated !== undefined) {
                setProgress(data.generated)
                setStatus(`Generated ${data.generated} / ${targetCount} examples...`)
              }
              if (data.complete) {
                setStatus(`Done! Generated ${data.total} examples.`)
                setProgress(targetCount)
              }
              if (data.error) {
                setError(data.error)
              }
            } catch {
              // ignore parse errors on partial chunks
            }
          }
        }
      }

      setGenerating(false)
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        setStatus('Generation cancelled.')
      } else {
        const msg = err instanceof Error ? err.message : String(err)
        setError(`Generation failed: ${msg}`)
        console.error(err)
      }
      setGenerating(false)
    }
  }

  function handleCancel() {
    abortRef.current?.abort()
  }

  const pct = targetCount > 0 ? Math.round((progress / targetCount) * 100) : 0

  return (
    <div className="p-8 max-w-xl">
      <Link href={`/projects/${projectId}`} className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">
        ← Back to project
      </Link>

      <h1 className="text-xl font-bold text-gray-900 mb-6">Generate examples</h1>

      {targetCount > 200 && !generating && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 mb-5">
          Generating {targetCount} examples may take up to 2 minutes.
        </div>
      )}

      {!generating && !status.includes('Done') && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              How many examples to generate?
            </label>
            <div className="grid grid-cols-4 gap-2">
              {COUNT_OPTIONS.map(n => (
                <button
                  key={n}
                  onClick={() => setTargetCount(n)}
                  className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    targetCount === n
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            onClick={handleGenerate}
            className="w-full bg-gray-900 text-white py-3 rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            Generate {targetCount} examples
          </button>
        </div>
      )}

      {generating && (
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-gray-600">{status}</span>
              <span className="font-medium text-gray-900">{pct}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-gray-900 h-2 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <button
            onClick={handleCancel}
            className="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 px-4 py-2 rounded-lg"
          >
            Cancel
          </button>
        </div>
      )}

      {!generating && status.includes('Done') && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-4 text-sm text-green-700">
            {status}
          </div>
          <div className="flex gap-3">
            <Link
              href={`/projects/${projectId}/label`}
              className="bg-gray-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
            >
              Start labeling
            </Link>
            <button
              onClick={() => { setStatus(''); setProgress(0) }}
              className="border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg text-sm hover:bg-gray-50"
            >
              Generate more
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
