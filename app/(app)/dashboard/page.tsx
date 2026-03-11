import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Project } from '@/lib/types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const { data: userProfile } = await supabase
    .from('users')
    .select('subscription_status, examples_generated_this_month')
    .eq('id', user.id)
    .single()

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500 mt-1">
            {userProfile?.examples_generated_this_month ?? 0} examples generated this month
            {userProfile?.subscription_status !== 'active' && (
              <Link href="/settings/billing" className="ml-2 text-amber-600 hover:underline">
                — Upgrade to generate more
              </Link>
            )}
          </p>
        </div>
        <Link
          href="/projects/new"
          className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          New project
        </Link>
      </div>

      {projects && projects.length > 0 ? (
        <div className="grid gap-4">
          {projects.map((project: Project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-2">No projects yet</h3>
          <p className="text-sm text-gray-500 mb-6">
            Create your first project to start building your eval dataset.
          </p>
          <Link
            href="/projects/new"
            className="bg-gray-900 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            Create first project
          </Link>
        </div>
      )}
    </div>
  )
}

async function ProjectCard({ project }: { project: Project }) {
  const supabase = await createClient()

  const [{ count: exampleCount }, { count: labeledCount }] = await Promise.all([
    supabase.from('examples').select('*', { count: 'exact', head: true }).eq('project_id', project.id),
    supabase.from('examples').select('*', { count: 'exact', head: true }).eq('project_id', project.id).in('label_status', ['accepted', 'edited', 'flagged']),
  ])

  return (
    <Link href={`/projects/${project.id}`} className="block bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">{project.name}</h3>
          <p className="text-sm text-gray-500 mt-0.5">{project.domain_description}</p>
        </div>
        <div className="text-right shrink-0 ml-4">
          <div className="text-sm font-medium text-gray-900">{exampleCount ?? 0} examples</div>
          <div className="text-xs text-gray-400">{labeledCount ?? 0} labeled</div>
        </div>
      </div>
      <div className="flex items-center gap-4 mt-4 text-xs text-gray-400">
        <span>{new Date(project.created_at).toLocaleDateString()}</span>
        {project.axes_extracted && (
          <span className="text-green-600 font-medium">Axes confirmed</span>
        )}
      </div>
    </Link>
  )
}
