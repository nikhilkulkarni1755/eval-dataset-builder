'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Example, LabelStatus, SchemaDefinition } from '@/lib/types'

interface LabelPageProps {
  params: Promise<{ id: string }>
}

const QUEUE_SIZE = 50

export default function LabelPage({ params }: LabelPageProps) {
  const [projectId, setProjectId] = useState<string>('')
  const [schema, setSchema] = useState<SchemaDefinition | null>(null)
  const [queue, setQueue] = useState<Example[]>([])
  const [cursor, setCursor] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [labeledCount, setLabeledCount] = useState(0)
  const [editMode, setEditMode] = useState(false)
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<string | null>(null)
  const [batchAcceptBanner, setBatchAcceptBanner] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const saveRetries = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    params.then(({ id }) => setProjectId(id))
  }, [params])

  useEffect(() => {
    if (!projectId) return
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function loadData() {
    const supabase = createClient()

    const [{ data: project }, { count: total }, { count: labeled }] = await Promise.all([
      supabase.from('projects').select('schema_definition').eq('id', projectId).single(),
      supabase.from('examples').select('*', { count: 'exact', head: true }).eq('project_id', projectId),
      supabase.from('examples').select('*', { count: 'exact', head: true }).eq('project_id', projectId).in('label_status', ['accepted', 'edited', 'flagged', 'rejected']),
    ])

    setSchema(project?.schema_definition ?? null)
    setTotalCount(total ?? 0)
    setLabeledCount(labeled ?? 0)

    // Load queue starting from first unlabeled
    const { data: examples } = await supabase
      .from('examples')
      .select('*')
      .eq('project_id', projectId)
      .in('label_status', ['unlabeled'])
      .order('created_at')
      .limit(QUEUE_SIZE)

    setQueue(examples ?? [])
    setCursor(0)
    setLoading(false)
  }

  async function loadMore() {
    if (!projectId) return
    const supabase = createClient()
    const { data: examples } = await supabase
      .from('examples')
      .select('*')
      .eq('project_id', projectId)
      .in('label_status', ['unlabeled'])
      .order('created_at')
      .range(queue.length, queue.length + QUEUE_SIZE - 1)

    if (examples && examples.length > 0) {
      setQueue(prev => [...prev, ...examples])
    }
  }

  const current = queue[cursor]

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function saveLabel(exampleId: string, status: LabelStatus, labeledOutput?: Record<string, unknown>) {
    const body: Record<string, unknown> = { label_status: status, labeled_at: new Date().toISOString() }
    if (labeledOutput) body.labeled_output = labeledOutput

    const attempt = async () => {
      const res = await fetch(`/api/examples/${exampleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Save failed')
    }

    try {
      await attempt()
    } catch {
      const retries = saveRetries.current.get(exampleId) ?? 0
      if (retries < 2) {
        saveRetries.current.set(exampleId, retries + 1)
        try {
          await attempt()
        } catch {
          showToast('Save failed — retrying...')
          setTimeout(async () => {
            try { await attempt() } catch { showToast('Save failed') }
          }, 2000)
        }
      }
    }
  }

  function advance() {
    setEditMode(false)
    setEditValues({})

    const nextIdx = cursor + 1
    if (nextIdx >= queue.length - 10) {
      loadMore()
    }
    setCursor(nextIdx)
    setLabeledCount(prev => prev + 1)
  }

  function checkBatchSimilarity(idx: number) {
    if (idx < 5) return
    const last5 = queue.slice(idx - 5, idx)
    const allSame = last5.every(e =>
      JSON.stringify(e.proposed_output) === JSON.stringify(last5[0].proposed_output)
    )
    if (allSame) setBatchAcceptBanner(idx - 5)
  }

  function handleAccept() {
    if (!current) return
    saveLabel(current.id, 'accepted', current.proposed_output as Record<string, unknown>)
    checkBatchSimilarity(cursor)
    advance()
  }

  function handleReject() {
    if (!current) return
    saveLabel(current.id, 'rejected')
    advance()
  }

  function handleFlag() {
    if (!current) return
    saveLabel(current.id, 'flagged', current.proposed_output as Record<string, unknown>)
    advance()
  }

  function handleSkip() {
    setCursor(prev => prev + 1)
    if (cursor + 1 >= queue.length - 10) loadMore()
  }

  function handleEdit() {
    if (!current) return
    if (editMode) {
      // Save edits
      const output: Record<string, unknown> = {}
      Object.entries(editValues).forEach(([k, v]) => { output[k] = v })
      saveLabel(current.id, 'edited', output)
      advance()
    } else {
      // Enter edit mode
      const vals: Record<string, string> = {}
      if (schema) {
        schema.output_fields.forEach(f => {
          const val = (current.proposed_output as Record<string, unknown>)[f.name]
          vals[f.name] = val !== undefined ? String(val) : ''
        })
      }
      setEditValues(vals)
      setEditMode(true)
    }
  }

  async function handleBatchAccept(fromIdx: number) {
    const batch = queue.slice(fromIdx, fromIdx + 6)
    setBatchAcceptBanner(null)

    for (const ex of batch) {
      saveLabel(ex.id, 'accepted', ex.proposed_output as Record<string, unknown>)
    }

    setLabeledCount(prev => prev + batch.length)
    setQueue(prev => prev.filter(e => !batch.find(b => b.id === e.id)))
    setCursor(0)
    showToast(`Accepted ${batch.length} examples`)
  }

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (editMode && e.key !== 'Escape') return
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return

    switch (e.key.toLowerCase()) {
      case 'a': handleAccept(); break
      case 'r': handleReject(); break
      case 'e': handleEdit(); break
      case 'f': handleFlag(); break
      case ' ': e.preventDefault(); handleSkip(); break
      case 'arrowleft': setCursor(prev => Math.max(0, prev - 1)); break
      case 'arrowright': setCursor(prev => Math.min(queue.length - 1, prev + 1)); break
      case 'escape': setEditMode(false); break
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, editMode, queue])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-gray-400 text-sm">
        Loading examples...
      </div>
    )
  }

  if (!current || cursor >= queue.length) {
    return (
      <div className="h-screen flex flex-col items-center justify-center text-center px-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">All caught up!</h2>
        <p className="text-gray-500 text-sm mb-6">No more unlabeled examples.</p>
        <div className="flex gap-3">
          <Link
            href={`/projects/${projectId}/export`}
            className="bg-gray-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700"
          >
            Export dataset
          </Link>
          <Link
            href={`/projects/${projectId}`}
            className="border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg text-sm hover:bg-gray-50"
          >
            Back to project
          </Link>
        </div>
      </div>
    )
  }

  const unlabeledRemaining = totalCount - labeledCount
  const estMinutes = Math.round((unlabeledRemaining * 5) / 60)

  return (
    <div className="h-screen flex flex-col">
      {/* Top bar */}
      <div className="border-b border-gray-200 bg-white px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link href={`/projects/${projectId}`} className="text-sm text-gray-400 hover:text-gray-600">
            ← Project
          </Link>
          <span className="text-sm text-gray-600 font-medium">
            {labeledCount} / {totalCount} labeled
            {estMinutes > 0 && <span className="text-gray-400 font-normal ml-1">— ~{estMinutes}m remaining</span>}
          </span>
        </div>

        {/* Keyboard legend */}
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {[
            { key: 'A', label: 'Accept' },
            { key: 'R', label: 'Reject' },
            { key: 'E', label: 'Edit' },
            { key: 'F', label: 'Flag' },
            { key: 'Space', label: 'Skip' },
          ].map(({ key, label }) => (
            <span key={key} className="flex items-center gap-1">
              <kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 font-mono">{key}</kbd>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Batch accept banner */}
      {batchAcceptBanner !== null && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center justify-between">
          <span className="text-sm text-amber-700">These examples look similar. Accept all 6?</span>
          <div className="flex gap-2">
            <button
              onClick={() => handleBatchAccept(batchAcceptBanner)}
              className="text-sm bg-amber-600 text-white px-4 py-1 rounded-lg hover:bg-amber-700"
            >
              Yes, accept all
            </button>
            <button
              onClick={() => setBatchAcceptBanner(null)}
              className="text-sm border border-amber-300 text-amber-700 px-4 py-1 rounded-lg hover:bg-amber-100"
            >
              No
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Input panel */}
        <div className="flex-1 border-r border-gray-200 p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Input</h2>
            <span className="text-xs text-gray-400">{cursor + 1} / {queue.length}</span>
          </div>
          {schema?.input_fields.map(field => (
            <div key={field.name} className="mb-4">
              <label className="block text-xs font-mono text-gray-500 mb-1">{field.name}</label>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap">
                {String((current.input_data as Record<string, unknown>)[field.name] ?? '')}
              </div>
            </div>
          ))}
        </div>

        {/* Output panel */}
        <div className="flex-1 p-6 overflow-y-auto">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
            {editMode ? 'Editing output' : 'Proposed output'}
          </h2>
          {schema?.output_fields.map(field => (
            <div key={field.name} className="mb-4">
              <label className="block text-xs font-mono text-gray-500 mb-1">{field.name}</label>
              {editMode ? (
                <textarea
                  value={editValues[field.name] ?? ''}
                  onChange={e => setEditValues(prev => ({ ...prev, [field.name]: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                  autoFocus
                />
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap">
                  {String((current.proposed_output as Record<string, unknown>)[field.name] ?? '')}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom actions */}
      <div className="border-t border-gray-200 bg-white px-6 py-4 flex items-center gap-3 shrink-0">
        <ActionButton onClick={handleAccept} color="green" label="Accept" shortcut="A" />
        <ActionButton onClick={handleReject} color="red" label="Reject" shortcut="R" />
        <ActionButton onClick={handleEdit} color={editMode ? 'blue' : 'default'} label={editMode ? 'Save edit' : 'Edit'} shortcut="E" />
        <ActionButton onClick={handleFlag} color="amber" label="Flag" shortcut="F" />
        <ActionButton onClick={handleSkip} color="default" label="Skip" shortcut="Space" />
        {editMode && (
          <button
            onClick={() => setEditMode(false)}
            className="ml-2 text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 right-6 bg-gray-900 text-white text-sm px-4 py-2 rounded-xl shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}

function ActionButton({
  onClick,
  color,
  label,
  shortcut,
}: {
  onClick: () => void
  color: 'green' | 'red' | 'blue' | 'amber' | 'default'
  label: string
  shortcut: string
}) {
  const colors = {
    green: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100',
    red: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
    default: 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100',
  }
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${colors[color]}`}
    >
      <kbd className="font-mono text-xs opacity-60">{shortcut}</kbd>
      {label}
    </button>
  )
}
