import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ exportId: string }> }
) {
  const { exportId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: exportRecord } = await supabase
    .from('exports')
    .select('*, projects!inner(user_id)')
    .eq('id', exportId)
    .single()

  if (!exportRecord) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!exportRecord.file_url) {
    return NextResponse.json({ error: 'File not available' }, { status: 404 })
  }

  return NextResponse.redirect(exportRecord.file_url)
}
