import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { ExportFormat, LabelStatus } from '@/lib/types'

function getSupabaseAdmin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { format, statuses } = await req.json() as { format: ExportFormat; statuses: LabelStatus[] }

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: examples } = await supabase
    .from('examples')
    .select('*')
    .eq('project_id', projectId)
    .in('label_status', statuses)
    .order('created_at')

  if (!examples || examples.length === 0) {
    return NextResponse.json({ error: 'No examples match filters' }, { status: 400 })
  }

  const schema = project.schema_definition
  const labeled = examples.map(ex => ({
    input: ex.input_data as Record<string, unknown>,
    output: (ex.labeled_output ?? ex.proposed_output) as Record<string, unknown>,
  }))

  let fileContent: string
  let fileName: string
  let contentType: string

  switch (format) {
    case 'jsonl': {
      fileContent = labeled.map(e => JSON.stringify({ input: e.input, output: e.output })).join('\n')
      fileName = `export-${Date.now()}.jsonl`
      contentType = 'application/x-ndjson'
      break
    }

    case 'csv': {
      const inputFields = schema.input_fields.map((f: { name: string }) => f.name)
      const outputFields = schema.output_fields.map((f: { name: string }) => f.name)
      const headers = [...inputFields, ...outputFields]
      const rows = labeled.map(e => {
        const values = headers.map(h => {
          const val = inputFields.includes(h) ? e.input[h] : e.output[h]
          const str = val === null || val === undefined ? '' : String(val)
          return `"${str.replace(/"/g, '""')}"`
        })
        return values.join(',')
      })
      fileContent = [headers.join(','), ...rows].join('\n')
      fileName = `export-${Date.now()}.csv`
      contentType = 'text/csv'
      break
    }

    case 'langsmith': {
      fileContent = labeled.map(e => JSON.stringify({ inputs: e.input, outputs: e.output })).join('\n')
      fileName = `export-${Date.now()}.jsonl`
      contentType = 'application/x-ndjson'
      break
    }

    case 'huggingface': {
      const datasetLines = labeled.map(e => JSON.stringify({ input: e.input, output: e.output })).join('\n')
      const datasetCard = `---
language:
- en
task_categories:
- text-classification
---

# Dataset Card

## Domain
${project.domain_description}

## Schema
Input fields: ${schema.input_fields.map((f: { name: string }) => f.name).join(', ')}
Output fields: ${schema.output_fields.map((f: { name: string }) => f.name).join(', ')}

## Statistics
- Examples: ${labeled.length}

## Generated with
Eval Dataset Builder
`
      // For simplicity, return JSONL (zip would require a zip library)
      fileContent = datasetLines
      fileName = `export-${Date.now()}.jsonl`
      contentType = 'application/x-ndjson'
      // Optionally prepend dataset card as comment
      fileContent = `# ${datasetCard.replace(/\n/g, '\n# ')}\n` + fileContent
      break
    }

    default:
      return NextResponse.json({ error: 'Invalid format' }, { status: 400 })
  }

  // Upload to Supabase Storage
  const storageKey = `exports/${user.id}/${fileName}`
  const { error: uploadError } = await getSupabaseAdmin().storage
    .from('exports')
    .upload(storageKey, fileContent, { contentType, upsert: true })

  let fileUrl: string | null = null
  if (!uploadError) {
    const { data: signedData } = await getSupabaseAdmin().storage
      .from('exports')
      .createSignedUrl(storageKey, 60 * 60 * 24 * 7) // 7 days
    fileUrl = signedData?.signedUrl ?? null
  } else {
    console.error('Storage upload failed:', uploadError)
    // Return file directly if storage fails
    return new Response(fileContent, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  }

  // Insert export record
  const { data: exportRecord } = await getSupabaseAdmin()
    .from('exports')
    .insert({
      project_id: projectId,
      format,
      example_count: labeled.length,
      filter_config: { statuses },
      file_url: fileUrl,
    })
    .select()
    .single()

  return NextResponse.json({ url: fileUrl, exportId: exportRecord?.id })
}
