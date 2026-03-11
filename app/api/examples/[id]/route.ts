import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { LabelStatus } from '@/lib/types'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: exampleId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    label_status: LabelStatus
    labeled_output?: Record<string, unknown>
    labeled_at?: string
  }

  // Verify ownership via join
  const { data: example } = await supabase
    .from('examples')
    .select('id, project_id, projects!inner(user_id)')
    .eq('id', exampleId)
    .single()

  if (!example) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updatePayload: Record<string, unknown> = {
    label_status: body.label_status,
    labeled_at: body.labeled_at ?? new Date().toISOString(),
  }

  if (body.labeled_output !== undefined) {
    updatePayload.labeled_output = body.labeled_output
  }

  const { error } = await supabase
    .from('examples')
    .update(updatePayload)
    .eq('id', exampleId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
