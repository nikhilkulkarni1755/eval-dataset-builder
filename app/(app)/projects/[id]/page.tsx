import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { DiversityAxis, Project } from '@/lib/types'
import AxesPanel from './AxesPanel'

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!project) notFound()

  const [
    { data: axes },
    { count: exampleCount },
    { count: labeledCount },
    { data: batches },
  ] = await Promise.all([
    supabase.from('diversity_axes').select('*').eq('project_id', id).order('created_at'),
    supabase.from('examples').select('*', { count: 'exact', head: true }).eq('project_id', id),
    supabase.from('examples').select('*', { count: 'exact', head: true }).eq('project_id', id).in('label_status', ['accepted', 'edited', 'flagged']),
    supabase.from('batches').select('*').eq('project_id', id).order('created_at', { ascending: false }).limit(5),
  ])

  const allConfirmed = axes && axes.length > 0 && axes.every((a: DiversityAxis) => a.is_confirmed)

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <Link href="/dashboard" className="text-sm text-gray-400 hover:text-gray-600 mb-2 inline-block">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
        <p className="text-sm text-gray-500 mt-1">{project.domain_description}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Total examples" value={exampleCount ?? 0} />
        <StatCard label="Labeled" value={labeledCount ?? 0} />
        <StatCard label="Diversity axes" value={axes?.length ?? 0} />
      </div>

      {/* Quick actions */}
      <div className="flex gap-3 mb-8">
        <Link
          href={`/projects/${id}/generate`}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            allConfirmed
              ? 'bg-gray-900 text-white hover:bg-gray-700'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed pointer-events-none'
          }`}
        >
          Generate examples
        </Link>
        <Link
          href={`/projects/${id}/label`}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Label examples
        </Link>
        <Link
          href={`/projects/${id}/export`}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Export
        </Link>
      </div>

      {/* Axes panel */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Diversity axes</h2>
          {!allConfirmed && axes && axes.length === 0 && (
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
              Extracting axes...
            </span>
          )}
        </div>

        {axes && axes.length > 0 ? (
          <AxesPanel projectId={id} initialAxes={axes as DiversityAxis[]} />
        ) : (
          <p className="text-sm text-gray-400">
            Axis extraction is running in the background. Refresh to see results.
          </p>
        )}
      </div>

      {/* Recent batches */}
      {batches && batches.length > 0 && (
        <div className="mt-6 bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Recent generation runs</h2>
          <div className="space-y-2">
            {batches.map((batch) => (
              <div key={batch.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-500">{new Date(batch.created_at).toLocaleString()}</span>
                <span className="text-gray-600">{batch.target_count} examples</span>
                <StatusBadge status={batch.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    complete: 'bg-green-50 text-green-700',
    generating: 'bg-blue-50 text-blue-700',
    failed: 'bg-red-50 text-red-700',
    partial: 'bg-amber-50 text-amber-700',
    pending: 'bg-gray-50 text-gray-600',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] ?? 'bg-gray-50 text-gray-600'}`}>
      {status}
    </span>
  )
}
