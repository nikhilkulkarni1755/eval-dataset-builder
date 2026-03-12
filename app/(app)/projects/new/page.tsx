'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SchemaDefinition, SchemaField } from '@/lib/types'

type Step = 1 | 2 | 3

interface SeedRow {
  input: Record<string, string>
  output: Record<string, string>
}

function inferType(value: unknown): SchemaField['type'] {
  if (value === null) return 'null'
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  return 'string'
}

export default function NewProjectPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 1
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')

  // Step 2
  const [schemaRaw, setSchemaRaw] = useState('')
  const [schemaError, setSchemaError] = useState('')
  const [schema, setSchema] = useState<SchemaDefinition | null>(null)
  const [inputFields, setInputFields] = useState<string[]>([])
  const [outputFields, setOutputFields] = useState<string[]>([])
  const [allFields, setAllFields] = useState<SchemaField[]>([])

  // Step 3
  const [seeds, setSeeds] = useState<SeedRow[]>([{ input: {}, output: {} }])
  const [jsonlPaste, setJsonlPaste] = useState('')
  const [jsonlError, setJsonlError] = useState('')

  function parseSchema() {
    setSchemaError('')
    try {
      const parsed = JSON.parse(schemaRaw)
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        setSchemaError('Schema must be a JSON object (a single sample row)')
        return
      }
      const fields: SchemaField[] = Object.entries(parsed).map(([name, val]) => ({
        name,
        type: inferType(val),
      }))
      setAllFields(fields)
      setInputFields(fields.map(f => f.name).slice(0, Math.ceil(fields.length / 2)))
      setOutputFields(fields.map(f => f.name).slice(Math.ceil(fields.length / 2)))
    } catch {
      setSchemaError('Invalid JSON — please check your input')
    }
  }

  function buildSchema(): SchemaDefinition {
    return {
      input_fields: allFields.filter(f => inputFields.includes(f.name)),
      output_fields: allFields.filter(f => outputFields.includes(f.name)),
    }
  }

  function toggleField(fieldName: string, toInput: boolean) {
    if (toInput) {
      setInputFields(prev => prev.includes(fieldName) ? prev.filter(f => f !== fieldName) : [...prev, fieldName])
      setOutputFields(prev => prev.filter(f => f !== fieldName))
    } else {
      setOutputFields(prev => prev.includes(fieldName) ? prev.filter(f => f !== fieldName) : [...prev, fieldName])
      setInputFields(prev => prev.filter(f => f !== fieldName))
    }
  }

  function parseJsonl() {
    setJsonlError('')
    const lines = jsonlPaste.trim().split('\n').filter(Boolean)
    try {
      const parsed = lines.map(line => JSON.parse(line))
      const newSeeds: SeedRow[] = parsed.map(obj => {
        const input: Record<string, string> = {}
        const output: Record<string, string> = {}
        inputFields.forEach(f => { input[f] = String(obj[f] ?? '') })
        outputFields.forEach(f => { output[f] = String(obj[f] ?? '') })
        return { input, output }
      })
      setSeeds(newSeeds)
    } catch {
      setJsonlError('Invalid JSONL — each line must be a valid JSON object')
    }
  }

  function updateSeed(idx: number, kind: 'input' | 'output', field: string, value: string) {
    setSeeds(prev => prev.map((s, i) =>
      i === idx ? { ...s, [kind]: { ...s[kind], [field]: value } } : s
    ))
  }

  function addSeedRow() {
    setSeeds(prev => [...prev, { input: {}, output: {} }])
  }

  function removeSeedRow(idx: number) {
    setSeeds(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit() {
    if (seeds.length < 3) {
      setError('Please provide at least 3 seed examples')
      return
    }

    setLoading(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const builtSchema = buildSchema()

    if (builtSchema.input_fields.length === 0 || builtSchema.output_fields.length === 0) {
      setError('Schema must have at least one input field and one output field')
      setLoading(false)
      return
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        user_id: user.id,
        name,
        domain_description: domain,
        schema_definition: builtSchema,
        schema_raw_input: schemaRaw,
      })
      .select()
      .single()

    if (projectError || !project) {
      setError('Failed to create project: ' + projectError?.message)
      setLoading(false)
      return
    }

    const seedRows = seeds.map((s, i) => ({
      project_id: project.id,
      input_data: s.input,
      output_data: s.output,
      order_index: i,
    }))

    const { error: seedError } = await supabase.from('seed_examples').insert(seedRows)
    if (seedError) {
      setError('Failed to save seed examples: ' + seedError.message)
      setLoading(false)
      return
    }

    // Trigger axis extraction in background
    fetch(`/api/projects/${project.id}/axes`, { method: 'POST' })

    router.push(`/projects/${project.id}`)
  }

  return (
    <div className="p-8 max-w-2xl">
      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {([1, 2, 3] as const).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${step >= s ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {s}
            </div>
            <span className={`text-sm ${step === s ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
              {s === 1 ? 'Project info' : s === 2 ? 'Schema' : 'Seed examples'}
            </span>
            {s < 3 && <div className="w-8 h-px bg-gray-200 mx-1" />}
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="space-y-5">
          <h1 className="text-xl font-bold text-gray-900">New project</h1>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="Customer support classifier"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Domain description</label>
            <textarea
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
              placeholder="One sentence describing what your model does, e.g. 'Classifies customer support tickets by urgency and department'"
            />
          </div>

          <button
            onClick={() => {
              if (!name.trim() || !domain.trim()) {
                setError('Both fields are required')
                return
              }
              setError('')
              setStep(2)
            }}
            className="bg-gray-900 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            Continue
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="space-y-5">
          <h1 className="text-xl font-bold text-gray-900">Define your schema</h1>
          <p className="text-sm text-gray-500">Paste a single JSON object representing one row of your dataset. We'll extract the field names and types.</p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sample JSON row</label>
            <textarea
              value={schemaRaw}
              onChange={(e) => {
                setSchemaRaw(e.target.value)
                setAllFields([])
                setSchemaError('')
              }}
              rows={8}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
              placeholder={'{\n  "ticket_text": "My order hasn\'t arrived",\n  "urgency": "high",\n  "department": "shipping"\n}'}
            />
            {schemaError && <p className="mt-1 text-sm text-red-600">{schemaError}</p>}
          </div>

          {allFields.length === 0 && (
            <button
              onClick={parseSchema}
              disabled={!schemaRaw.trim()}
              className="bg-gray-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-40"
            >
              Parse schema
            </button>
          )}

          {allFields.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">
                Mark each field as input or output:
              </p>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Field</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Type</th>
                      <th className="px-4 py-2.5 font-medium text-gray-600 text-center">Input</th>
                      <th className="px-4 py-2.5 font-medium text-gray-600 text-center">Output</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {allFields.map((field) => (
                      <tr key={field.name}>
                        <td className="px-4 py-2.5 font-mono text-gray-800">{field.name}</td>
                        <td className="px-4 py-2.5 text-gray-500">{field.type}</td>
                        <td className="px-4 py-2.5 text-center">
                          <input
                            type="radio"
                            name={`field-${field.name}`}
                            checked={inputFields.includes(field.name)}
                            onChange={() => toggleField(field.name, true)}
                            className="accent-gray-900"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <input
                            type="radio"
                            name={`field-${field.name}`}
                            checked={outputFields.includes(field.name)}
                            onChange={() => toggleField(field.name, false)}
                            className="accent-gray-900"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-3 mt-5">
                <button
                  onClick={() => setStep(1)}
                  className="px-5 py-2 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={() => {
                    if (inputFields.length === 0 || outputFields.length === 0) {
                      setError('Select at least one input and one output field')
                      return
                    }
                    setError('')
                    setSchema(buildSchema())
                    setSeeds([{ input: {}, output: {} }])
                    setStep(3)
                  }}
                  className="bg-gray-900 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
                >
                  Continue
                </button>
              </div>
              {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
            </div>
          )}
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="space-y-5">
          <h1 className="text-xl font-bold text-gray-900">Add seed examples</h1>
          <p className="text-sm text-gray-500">Add 3–10 high-quality examples. These guide the generation quality.</p>

          {/* JSONL paste */}
          <details className="border border-gray-200 rounded-xl">
            <summary className="px-4 py-3 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-50 rounded-xl">
              Paste JSONL instead
            </summary>
            <div className="px-4 pb-4 pt-2">
              <textarea
                value={jsonlPaste}
                onChange={(e) => { setJsonlPaste(e.target.value); setJsonlError('') }}
                rows={5}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                placeholder={'{"ticket_text": "...", "urgency": "high", "department": "billing"}\n{"ticket_text": "...", "urgency": "low", "department": "shipping"}'}
              />
              {jsonlError && <p className="mt-1 text-sm text-red-600">{jsonlError}</p>}
              <button
                onClick={parseJsonl}
                className="mt-2 text-sm bg-gray-100 text-gray-700 px-4 py-1.5 rounded-lg hover:bg-gray-200"
              >
                Import JSONL
              </button>
            </div>
          </details>

          {/* Manual table */}
          <div className="space-y-3">
            {seeds.map((seed, idx) => (
              <div key={idx} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Example {idx + 1}</span>
                  {seeds.length > 1 && (
                    <button onClick={() => removeSeedRow(idx)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Inputs</p>
                    {inputFields.map(f => (
                      <div key={f} className="mb-2">
                        <label className="block text-xs text-gray-600 mb-0.5 font-mono">{f}</label>
                        <textarea
                          value={seed.input[f] ?? ''}
                          onChange={(e) => updateSeed(idx, 'input', f, e.target.value)}
                          rows={2}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-900 resize-none"
                        />
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Outputs</p>
                    {outputFields.map(f => (
                      <div key={f} className="mb-2">
                        <label className="block text-xs text-gray-600 mb-0.5 font-mono">{f}</label>
                        <textarea
                          value={seed.output[f] ?? ''}
                          onChange={(e) => updateSeed(idx, 'output', f, e.target.value)}
                          rows={2}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-900 resize-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            <button
              onClick={addSeedRow}
              className="w-full border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors"
            >
              + Add example
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => setStep(2)}
              className="px-5 py-2 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="bg-gray-900 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating project...' : 'Create project'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
