export type SubscriptionStatus = 'active' | 'canceled' | 'trialing' | 'past_due' | 'inactive'
export type LabelStatus = 'unlabeled' | 'accepted' | 'rejected' | 'edited' | 'flagged'
export type BatchStatus = 'pending' | 'generating' | 'complete' | 'failed' | 'partial'
export type ExportFormat = 'jsonl' | 'csv' | 'huggingface' | 'langsmith'

export interface UserProfile {
  id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  subscription_status: SubscriptionStatus
  examples_generated_this_month: number
  billing_period_start: string
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  user_id: string
  name: string
  domain_description: string
  schema_definition: SchemaDefinition
  schema_raw_input: string | null
  axes_extracted: boolean
  created_at: string
  updated_at: string
}

export interface SchemaDefinition {
  input_fields: SchemaField[]
  output_fields: SchemaField[]
}

export interface SchemaField {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null'
}

export interface SeedExample {
  id: string
  project_id: string
  input_data: Record<string, unknown>
  output_data: Record<string, unknown>
  order_index: number
  created_at: string
}

export interface DiversityAxis {
  id: string
  project_id: string
  name: string
  description: string
  values: string[]
  is_confirmed: boolean
  created_at: string
}

export interface Batch {
  id: string
  project_id: string
  status: BatchStatus
  target_count: number
  generation_config: Record<string, unknown>
  created_at: string
  completed_at: string | null
}

export interface Example {
  id: string
  project_id: string
  batch_id: string
  input_data: Record<string, unknown>
  proposed_output: Record<string, unknown>
  labeled_output: Record<string, unknown> | null
  label_status: LabelStatus
  raw_claude_response: string | null
  created_at: string
  labeled_at: string | null
}

export interface Export {
  id: string
  project_id: string
  format: ExportFormat
  example_count: number
  filter_config: Record<string, unknown>
  file_url: string | null
  created_at: string
}
