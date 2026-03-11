'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ExportFormat, LabelStatus } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

interface ExportRecord {
  id: string
  format: ExportFormat
  example_count: number
  filter_config: Record<string, unknown>
  file_url: string | null
  created_at: string
}

const FORMAT_LABELS: Record<ExportFormat, string> = {
  jsonl: 'JSONL',
  csv: 'CSV',
  huggingface: 'Hugging Face',
  langsmith: 'LangSmith',
}

export default function ExportPage({ params }: { params: Promise<{ id: string }> }) {
  const [projectId, setProjectId] = useState<string>('')
  const [format, setFormat] = useState<ExportFormat>('jsonl')
  const [statuses, setStatuses] = useState<LabelStatus[]>(['accepted', 'edited', 'flagged'])
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportUrl, setExportUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<ExportRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    params.then(({ id }) => setProjectId(id))
  }, [params])

  useEffect(() => {
    if (!projectId) return
    loadHistory()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    if (!projectId || statuses.length === 0) { setPreviewCount(0); return }
    const supabase = createClient()
    supabase
      .from('examples')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .in('label_status', statuses)
      .then(({ count }) => setPreviewCount(count ?? 0))
  }, [projectId, statuses])

  async function loadHistory() {
    const supabase = createClient()
    const { data } = await supabase
      .from('exports')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    setHistory((data ?? []) as ExportRecord[])
    setLoading(false)
  }

  function toggleStatus(s: LabelStatus) {
    setStatuses(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    )
  }

  async function handleExport() {
    if (statuses.length === 0 || !previewCount) {
      setError('No examples match the selected filters.')
      return
    }
    setExporting(true)
    setError('')
    setExportUrl(null)

    const res = await fetch(`/api/projects/${projectId}/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format, statuses }),
    })

    if (!res.ok) {
      setError('Export failed. Please try again.')
      setExporting(false)
      return
    }

    const { url, exportId } = await res.json()
    setExportUrl(url)
    setExporting(false)
    loadHistory()
    // Auto-download
    const a = document.createElement('a')
    a.href = url
    a.download = `export-${exportId}.${format === 'huggingface' ? 'zip' : format === 'csv' ? 'csv' : 'jsonl'}`
    a.click()
  }

  return (
    <div className="p-8 max-w-2xl">
      <Link href={`/projects/${projectId}`} className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">
        ← Back to project
      </Link>

      <h1 className="text-xl font-bold text-gray-900 mb-6">Export dataset</h1>

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
        {/* Format */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Format</label>
          <div className="grid grid-cols-4 gap-2">
            {(Object.keys(FORMAT_LABELS) as ExportFormat[]).map(f => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`py-2 rounded-lg text-sm border font-medium transition-colors ${
                  format === f
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {FORMAT_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Include examples with status</label>
          <div className="flex gap-3">
            {(['accepted', 'edited', 'flagged'] as LabelStatus[]).map(s => (
              <label key={s} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={statuses.includes(s)}
                  onChange={() => toggleStatus(s)}
                  className="accent-gray-900"
                />
                <span className="text-sm text-gray-700 capitalize">{s}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-600">
          This will export <span className="font-semibold text-gray-900">{previewCount ?? '...'} examples</span>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {exportUrl && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700 flex items-center justify-between">
            <span>Export ready!</span>
            <a href={exportUrl} className="underline font-medium">Download again</a>
          </div>
        )}

        <button
          onClick={handleExport}
          disabled={exporting || !previewCount}
          className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {exporting ? 'Exporting...' : `Export ${previewCount ?? 0} examples as ${FORMAT_LABELS[format]}`}
        </button>
      </div>

      {/* Export history */}
      {!loading && history.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Export history</h2>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Format</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Examples</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Date</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map(exp => (
                  <tr key={exp.id}>
                    <td className="px-4 py-3 font-medium text-gray-800">{FORMAT_LABELS[exp.format]}</td>
                    <td className="px-4 py-3 text-gray-600">{exp.example_count}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(exp.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      {exp.file_url ? (
                        <a href={exp.file_url} className="text-gray-500 hover:text-gray-900 underline text-xs">
                          Download
                        </a>
                      ) : (
                        <span className="text-gray-300 text-xs">Unavailable</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
