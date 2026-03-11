import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: seeds } = await supabase
    .from('seed_examples')
    .select('*')
    .eq('project_id', projectId)
    .order('order_index')

  // Check if axes already extracted
  const { count: existingCount } = await supabase
    .from('diversity_axes')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)

  if (existingCount && existingCount > 0) {
    return NextResponse.json({ message: 'Axes already extracted' })
  }

  const prompt = `You are helping build an LLM evaluation dataset.

Domain: ${project.domain_description}

Schema:
${JSON.stringify(project.schema_definition, null, 2)}

Seed examples:
${(seeds ?? []).map((e: { input_data: unknown; output_data: unknown }) => JSON.stringify({ ...(e.input_data as Record<string, unknown>), ...(e.output_data as Record<string, unknown>) })).join('\n')}

Identify 5–8 diversity axes — dimensions of variation that matter for this domain and would help create a comprehensive eval dataset. For each axis, provide:
- name: short label (2–3 words)
- description: one sentence explaining what this axis captures
- values: 3–5 discrete values this axis can take

Return ONLY a JSON array. No preamble. No explanation. Example format:
[
  {
    "name": "tone",
    "description": "The emotional register of the user input",
    "values": ["angry", "confused", "polite", "urgent"]
  }
]`

  let rawResponse = ''
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    rawResponse = message.content[0].type === 'text' ? message.content[0].text : ''

    // Extract JSON from response
    const jsonMatch = rawResponse.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array found in response')

    const axes = JSON.parse(jsonMatch[0]) as Array<{
      name: string
      description: string
      values: string[]
    }>

    const axisRows = (axes as Array<{ name: string; description: string; values: string[] }>).map(a => ({
      project_id: projectId,
      name: a.name,
      description: a.description,
      values: a.values,
      is_confirmed: false,
    }))

    await supabase.from('diversity_axes').insert(axisRows)

    return NextResponse.json({ success: true, count: axes.length })
  } catch (err) {
    console.error('Axis extraction failed:', err, 'Raw response:', rawResponse)
    return NextResponse.json({ error: 'Axis extraction failed' }, { status: 500 })
  }
}
