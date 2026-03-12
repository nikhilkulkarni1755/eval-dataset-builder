import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

function getSupabaseAdmin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const BATCH_SIZE = 15
const CONCURRENCY = 5

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  // Billing check
  const { data: profile } = await supabase
    .from('users')
    .select('subscription_status, examples_generated_this_month, billing_period_start')
    .eq('id', user.id)
    .single()

  const isDemoMode = process.env.DEMO_MODE === 'true'
  if (!isDemoMode && (!profile || profile.subscription_status !== 'active')) {
    return new Response(JSON.stringify({ requiresPayment: true }), { status: 402 })
  }

  // Reset monthly counter if billing period has rolled over
  if (profile) {
    const billingStart = new Date(profile.billing_period_start)
    const now = new Date()
    const daysSinceBilling = (now.getTime() - billingStart.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceBilling >= 30) {
      await getSupabaseAdmin()
        .from('users')
        .update({ examples_generated_this_month: 0, billing_period_start: now.toISOString() })
        .eq('id', user.id)
      profile.examples_generated_this_month = 0
    }

    if (profile.examples_generated_this_month >= 1000) {
      return new Response(JSON.stringify({ requiresOverage: true }), { status: 402 })
    }
  }

  const { target_count } = await req.json() as { target_count: number }

  // Load project data
  const [
    { data: project },
    { data: seeds },
    { data: axes },
  ] = await Promise.all([
    supabase.from('projects').select('*').eq('id', projectId).eq('user_id', user.id).single(),
    supabase.from('seed_examples').select('*').eq('project_id', projectId).order('order_index'),
    supabase.from('diversity_axes').select('*').eq('project_id', projectId).eq('is_confirmed', true),
  ])

  if (!project) {
    return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404 })
  }

  // Create batch record
  const { data: batch } = await getSupabaseAdmin()
    .from('batches')
    .insert({
      project_id: projectId,
      status: 'generating',
      target_count,
      generation_config: { axes: axes ?? [], target_count },
    })
    .select()
    .single()

  if (!batch) {
    return new Response(JSON.stringify({ error: 'Failed to create batch' }), { status: 500 })
  }

  const schema = project.schema_definition
  const inputFields = schema.input_fields.map((f: { name: string }) => f.name)
  const outputFields = schema.output_fields.map((f: { name: string }) => f.name)

  const totalBatches = Math.ceil(target_count / BATCH_SIZE)
  let totalGenerated = 0

  // Create a readable stream to send progress
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      // Send SSE heartbeat every 15s to keep Cloudflare Tunnel / proxies alive.
      // Cloudflare's idle read timeout resets on each chunk received.
      let heartbeatInterval: ReturnType<typeof setInterval> | null = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: heartbeat\n\n`)) } catch { /* stream closed */ }
      }, 15_000)

      try {
        // Process batches in parallel groups of CONCURRENCY
        for (let groupStart = 0; groupStart < totalBatches; groupStart += CONCURRENCY) {
          const groupEnd = Math.min(groupStart + CONCURRENCY, totalBatches)
          const groupBatches = Array.from({ length: groupEnd - groupStart }, (_, i) => groupStart + i)

          const results = await Promise.allSettled(
            groupBatches.map(batchIdx => generateBatch({
              batchIdx,
              batchSize: Math.min(BATCH_SIZE, target_count - batchIdx * BATCH_SIZE),
              project,
              schema,
              inputFields,
              outputFields,
              seeds: seeds ?? [],
              axes: axes ?? [],
              batchId: batch.id,
              projectId,
            }))
          )

          for (const result of results) {
            if (result.status === 'fulfilled') {
              totalGenerated += result.value
            }
          }

          send({ generated: totalGenerated })
        }

        // Mark batch complete
        await getSupabaseAdmin()
          .from('batches')
          .update({ status: 'complete', completed_at: new Date().toISOString() })
          .eq('id', batch.id)

        // Update user usage counter
        await getSupabaseAdmin()
          .from('users')
          .update({
            examples_generated_this_month: (profile?.examples_generated_this_month ?? 0) + totalGenerated,
          })
          .eq('id', user.id)

        send({ complete: true, total: totalGenerated })
      } catch (err) {
        console.error('Generation stream error:', err)
        send({ error: 'Generation failed for some examples.' })

        await getSupabaseAdmin()
          .from('batches')
          .update({ status: 'failed' })
          .eq('id', batch.id)
      } finally {
        if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null }
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

interface GenerateBatchArgs {
  batchIdx: number
  batchSize: number
  project: { domain_description: string; schema_definition: unknown }
  schema: { input_fields: Array<{ name: string }>; output_fields: Array<{ name: string }> }
  inputFields: string[]
  outputFields: string[]
  seeds: Array<{ input_data: unknown; output_data: unknown }>
  axes: Array<{ name: string; values: string[] }>
  batchId: string
  projectId: string
}

async function generateBatch({
  batchIdx,
  batchSize,
  project,
  schema,
  inputFields,
  outputFields,
  seeds,
  axes,
  batchId,
  projectId,
}: GenerateBatchArgs): Promise<number> {
  // Create axis slice for this batch — cycle through axis values
  const axisSlice = axes.map(axis => {
    const valueIdx = batchIdx % axis.values.length
    return { name: axis.name, value: axis.values[valueIdx] }
  })

  const seedExamples = seeds.slice(0, 3).map(s => ({
    ...(s.input_data as Record<string, unknown>),
    ...(s.output_data as Record<string, unknown>),
  }))

  const prompt = `You are generating evaluation examples for an LLM system.

Domain: ${project.domain_description}

Schema (input fields: ${inputFields.join(', ')}, output fields: ${outputFields.join(', ')}):
${JSON.stringify(schema)}

Seed examples for reference (match this quality and format):
${JSON.stringify(seedExamples)}

For this batch, emphasize these axis values:
${JSON.stringify(axisSlice)}

Generate exactly ${batchSize} diverse examples. Each must:
- Be realistic and varied
- Match the schema exactly
- Have plausibly correct outputs a human would agree with
- Cover edge cases and boundary conditions

Return ONLY a JSON array of objects. No preamble. Each object has all input fields and all output fields.`

  let rawResponse = ''

  const attemptGeneration = async (): Promise<number> => {
    const message = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    rawResponse = message.content[0].type === 'text' ? message.content[0].text : ''

    const jsonMatch = rawResponse.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array in response')

    const examples = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>

    const rows = examples.map(ex => {
      const inputData: Record<string, unknown> = {}
      const outputData: Record<string, unknown> = {}
      inputFields.forEach(f => { inputData[f] = ex[f] ?? null })
      outputFields.forEach(f => { outputData[f] = ex[f] ?? null })

      return {
        project_id: projectId,
        batch_id: batchId,
        input_data: inputData,
        proposed_output: outputData,
        label_status: 'unlabeled',
        raw_claude_response: rawResponse,
      }
    })

    await getSupabaseAdmin().from('examples').insert(rows)
    return rows.length
  }

  try {
    return await attemptGeneration()
  } catch (err) {
    console.error(`Batch ${batchIdx} failed, retrying:`, err)
    try {
      return await attemptGeneration()
    } catch (retryErr) {
      console.error(`Batch ${batchIdx} retry failed:`, retryErr, 'Raw:', rawResponse)
      return 0
    }
  }
}
