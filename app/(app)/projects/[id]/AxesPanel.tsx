'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DiversityAxis } from '@/lib/types'

export default function AxesPanel({
  projectId,
  initialAxes,
}: {
  projectId: string
  initialAxes: DiversityAxis[]
}) {
  const router = useRouter()
  const [axes, setAxes] = useState<DiversityAxis[]>(initialAxes)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const allConfirmed = axes.every(a => a.is_confirmed)

  async function confirmAll() {
    setSaving(true)
    const supabase = createClient()
    await supabase
      .from('diversity_axes')
      .update({ is_confirmed: true })
      .eq('project_id', projectId)

    // Also mark project axes_extracted
    await supabase
      .from('projects')
      .update({ axes_extracted: true })
      .eq('id', projectId)

    setAxes(prev => prev.map(a => ({ ...a, is_confirmed: true })))
    setSaving(false)
    router.refresh()
  }

  async function deleteAxis(id: string) {
    const supabase = createClient()
    await supabase.from('diversity_axes').delete().eq('id', id)
    setAxes(prev => prev.filter(a => a.id !== id))
  }

  async function saveAxis(axis: DiversityAxis) {
    const supabase = createClient()
    await supabase
      .from('diversity_axes')
      .update({ name: axis.name, description: axis.description, values: axis.values })
      .eq('id', axis.id)
    setAxes(prev => prev.map(a => a.id === axis.id ? axis : a))
    setEditingId(null)
  }

  async function addAxis() {
    const supabase = createClient()
    const { data } = await supabase
      .from('diversity_axes')
      .insert({
        project_id: projectId,
        name: 'New axis',
        description: 'Describe this axis',
        values: ['value1', 'value2'],
        is_confirmed: false,
      })
      .select()
      .single()
    if (data) {
      setAxes(prev => [...prev, data as DiversityAxis])
      setEditingId(data.id)
    }
  }

  return (
    <div>
      <div className="space-y-3 mb-4">
        {axes.map(axis => (
          <AxisRow
            key={axis.id}
            axis={axis}
            editing={editingId === axis.id}
            onEdit={() => setEditingId(axis.id)}
            onSave={saveAxis}
            onDelete={() => deleteAxis(axis.id)}
            onCancel={() => setEditingId(null)}
          />
        ))}
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={addAxis}
          className="text-sm text-gray-500 hover:text-gray-700 border border-dashed border-gray-300 px-4 py-1.5 rounded-lg hover:border-gray-400 transition-colors"
        >
          + Add axis
        </button>
        {!allConfirmed && (
          <button
            onClick={confirmAll}
            disabled={saving}
            className="text-sm bg-gray-900 text-white px-5 py-1.5 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Confirming...' : 'Confirm all axes'}
          </button>
        )}
        {allConfirmed && (
          <span className="text-sm text-green-600 font-medium">All axes confirmed — generation is unlocked</span>
        )}
      </div>
    </div>
  )
}

function AxisRow({
  axis,
  editing,
  onEdit,
  onSave,
  onDelete,
  onCancel,
}: {
  axis: DiversityAxis
  editing: boolean
  onEdit: () => void
  onSave: (a: DiversityAxis) => void
  onDelete: () => void
  onCancel: () => void
}) {
  const [local, setLocal] = useState(axis)

  if (editing) {
    return (
      <div className="border border-gray-300 rounded-xl p-4 bg-gray-50">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input
              value={local.name}
              onChange={e => setLocal(p => ({ ...p, name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <input
              value={local.description}
              onChange={e => setLocal(p => ({ ...p, description: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Values (comma-separated)</label>
            <input
              value={local.values.join(', ')}
              onChange={e => setLocal(p => ({ ...p, values: e.target.value.split(',').map(v => v.trim()).filter(Boolean) }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => onSave(local)} className="text-sm bg-gray-900 text-white px-4 py-1.5 rounded-lg hover:bg-gray-700">Save</button>
            <button onClick={onCancel} className="text-sm border border-gray-300 px-4 py-1.5 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`border rounded-xl p-4 flex items-start justify-between ${axis.is_confirmed ? 'border-green-200 bg-green-50/30' : 'border-gray-200'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 text-sm">{axis.name}</span>
          {axis.is_confirmed && (
            <span className="text-xs text-green-600 bg-green-100 px-1.5 py-0.5 rounded">confirmed</span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{axis.description}</p>
        <div className="flex flex-wrap gap-1 mt-2">
          {axis.values.map(v => (
            <span key={v} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{v}</span>
          ))}
        </div>
      </div>
      <div className="flex gap-2 ml-3 shrink-0">
        <button onClick={onEdit} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100">Edit</button>
        <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50">Delete</button>
      </div>
    </div>
  )
}
